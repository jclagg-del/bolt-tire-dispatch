import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paidWebsiteOrder, websitePaymentFields } from "@/lib/paid-website-order";
import { sendPaymentNotification } from "@/lib/payment-notifications";
import { sendCustomerPaymentConfirmation } from "@/lib/customer-payment-confirmation";

async function notifyPaidCustomer(sessionId: string, quote: Parameters<typeof sendPaymentNotification>[1], option: Parameters<typeof sendPaymentNotification>[2], officeAlreadySent = false) {
  // Wait for both attempts, even if one fails, so serverless cleanup cannot
  // interrupt the other send. Each recipient has an independent durable receipt.
  const results = await Promise.allSettled([
    officeAlreadySent ? Promise.resolve() : sendPaymentNotification(sessionId, quote, option),
    sendCustomerPaymentConfirmation(sessionId, quote, option),
  ]);
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

function valid(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((item) => item.split("=")));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const first = Buffer.from(expected);
  const second = Buffer.from(parts.v1);
  return first.length === second.length && timingSafeEqual(first, second);
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const payload = await request.text();
  if (!valid(payload, request.headers.get("stripe-signature") || "", secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  let event;
  try { event = JSON.parse(payload); } catch { return NextResponse.json({ error: "Invalid event" }, { status: 400 }); }
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) || event.data.object.payment_status !== "paid") return NextResponse.json({ received: true });

  const session = event.data.object;
  const quoteId = session.metadata?.quote_id;
  if (!quoteId) return NextResponse.json({ received: true });
  const admin = createAdminClient();
  try {
  const paidAt = new Date().toISOString();
  const amountPaid = Number(session.amount_total || 0) / 100;
  const salesTax = Number(session.total_details?.amount_tax || 0) / 100;
  const { data: quote, error: quoteError } = await admin.from("quotes").select("*,quote_options!quote_options_quote_id_fkey(*)").eq("id", quoteId).single();
  if (quoteError || !quote) throw new Error(quoteError?.message || "Paid quote not found");
  const option = (quote.quote_options || []).find((item: { id: string }) => item.id === (session.metadata?.option_id || quote.selected_option_id));
  if (!option) throw new Error("Paid quote has no matching tire option");
  if (quote.stripe_payment_intent_id && quote.stripe_payment_intent_id !== session.payment_intent) throw new Error("A different payment already exists for this quote. Review payment before proceeding.");
  const payment = { payment_status: "paid", amount_paid: amountPaid, stripe_sales_tax_amount: salesTax, paid_at: quote.paid_at || paidAt, stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null, selected_option_id: option.id, updated_at: paidAt };
  const { error: paymentError } = await admin.from("quotes").update(payment).eq("id", quoteId);
  if (paymentError) throw new Error(paymentError.message);
  Object.assign(quote, payment);
  if (quote.purchase_source !== "website") {
    await notifyPaidCustomer(session.id, quote, option);
    return NextResponse.json({ received: true });
  }

  // Organization purchases wait in Orders. Payment never places a supplier order
  // or checks "Tires ordered". Unique source_quote_id makes webhook retries safe.
  if (quote.discount_organization) {
    const orderValues = paidWebsiteOrder(quote, option);
    const { data: created, error: orderError } = await admin.from("customer_orders").insert(orderValues).select("id,payment_notification_sent_at").single();
    let order = created;
    if (orderError?.code === "23505") {
      const existing = await admin.from("customer_orders").select("id,payment_notification_sent_at").eq("source_quote_id", quote.id).single();
      if (existing.error) throw new Error(existing.error.message);
      order = existing.data;
    } else if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("Paid order could not be saved");
    await notifyPaidCustomer(session.id, quote, option, Boolean(order.payment_notification_sent_at));
    if (!order.payment_notification_sent_at) {
      const notified = await admin.from("customer_orders").update({ payment_notification_sent_at: paidAt }).eq("id", order.id);
      if (notified.error) throw new Error(notified.error.message);
    }
    return NextResponse.json({ received: true, orderId: order.id });
  }

  if (quote.converted_job_id) {
    await notifyPaidCustomer(session.id, quote, option);
    return NextResponse.json({ received: true, jobId: quote.converted_job_id });
  }

  const scheduled = quote.requested_date && quote.requested_time ? `${quote.requested_date}T${String(quote.requested_time).substring(0, 5)}:00` : null;
  const { data: createdJob, error: jobError } = await admin.from("jobs").insert({
    customer: quote.customer, contact_name: quote.contact_name, phone: quote.phone,
    address: quote.address, scheduled, tire_supplier: option.supplier || "ATD", tires_ordered: false,
    notes: [quote.notes, `Paid website order from quote #${quote.quote_number}. Order tires before the appointment.`].filter(Boolean).join("\n"),
    complete: false, archived: false, vehicle_id: "stepvan", job_status: scheduled ? "scheduled" : "paid",
    ...websitePaymentFields(quote, option),
  }).select("id").single();

  let jobId = createdJob?.id;
  if (jobError?.code === "23505") {
    const { data: existing } = await admin.from("jobs").select("id").eq("source_quote_id", quote.id).single();
    jobId = existing?.id;
  } else if (jobError) {
    return NextResponse.json({ error: `Payment recorded, but job creation failed: ${jobError.message}` }, { status: 500 });
  }
  if (!jobId) throw new Error("Paid job could not be located");
  const linked = await admin.from("quotes").update({ status: "converted", converted_job_id: jobId, appointment_hold_expires_at: null, updated_at: paidAt }).eq("id", quote.id);
  if (linked.error) throw new Error(linked.error.message);
  await notifyPaidCustomer(session.id, quote, option);
  return NextResponse.json({ received: true, jobId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Paid order could not be recorded" }, { status: 500 });
  }
}
