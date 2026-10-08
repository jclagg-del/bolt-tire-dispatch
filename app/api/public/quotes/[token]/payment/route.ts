import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewQuotePayment, confirmQuotePayment, paymentReview } from "@/lib/quote-payment-checkout";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // Enrollment is gated at quote creation. Already-enrolled quotes must remain
  // payable/recoverable if new enrollment is disabled during a rollback.
  try {
    const { token } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid checkout origin" }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = JSON.parse(raw);
    const admin = createAdminClient();
    const { data: quote, error } = await admin.from("quotes").select("*,quote_options!quote_options_quote_id_fkey(*)").eq("public_token", token).single();
    if (error || !quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    if (quote.payment_pricing_version !== 1 || quote.stripe_checkout_session_id) return NextResponse.json({ error: "Use the original checkout for this quote." }, { status: 409 });
    if (body.action === "status") {
      const active = await admin.from("quote_payment_attempts").select("*").eq("quote_id", quote.id).not("state", "in", "(failed,canceled,expired)").maybeSingle();
      if (active.error) throw new Error("Payment status could not be checked.");
      return NextResponse.json({ paid: quote.payment_status === "paid", payment: active.data ? paymentReview(active.data) : null }, { headers: { "Cache-Control": "no-store" } });
    }
    if (["paid", "refunded"].includes(quote.payment_status)) return NextResponse.json({ error: "This quote has already been paid." }, { status: 409 });
    if (body.action === "review") return NextResponse.json(await reviewQuotePayment(admin, quote, String(body.optionId || ""), String(body.confirmationToken || ""), body.serviceAddress));
    if (body.action === "confirm") {
      if (!/^[0-9a-f-]{36}$/i.test(body.reviewId || "")) throw new Error("Review the payment first.");
      return NextResponse.json(await confirmQuotePayment(admin, quote.id, body.reviewId));
    }
    if (body.action === "cancel-review") {
      if (!/^[0-9a-f-]{36}$/i.test(body.reviewId || "")) throw new Error("Review the payment first.");
      // Shares the quote lock with submission; a submitted payment cannot be canceled here.
      const canceled = await admin.rpc("cancel_quote_payment_review", { p_quote_id: quote.id, p_attempt_id: body.reviewId });
      if (canceled.error || !canceled.data) throw new Error("This payment has already been submitted. Check its status before continuing.");
      return NextResponse.json({ canceled: true });
    }
    return NextResponse.json({ error: "Unsupported payment action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment could not be completed. Check its status before retrying." }, { status: 409 });
  }
}
