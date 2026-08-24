import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const event = JSON.parse(payload);
  if (event.type !== "checkout.session.completed" || event.data.object.payment_status !== "paid") return NextResponse.json({ received: true });

  const session = event.data.object;
  const quoteId = session.metadata?.quote_id;
  if (!quoteId) return NextResponse.json({ received: true });
  const admin = createAdminClient();
  const paidAt = new Date().toISOString();
  const amountPaid = Number(session.amount_total || 0) / 100;
  const salesTax = Number(session.total_details?.amount_tax || 0) / 100;
  await admin.from("quotes").update({ payment_status: "paid", amount_paid: amountPaid, stripe_sales_tax_amount: salesTax, paid_at: paidAt, stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null, updated_at: paidAt }).eq("id", quoteId);

  const { data: quote } = await admin.from("quotes").select("*,quote_options!quote_options_quote_id_fkey(*)").eq("id", quoteId).single();
  if (!quote || quote.purchase_source !== "website" || quote.converted_job_id) return NextResponse.json({ received: true });
  const option = (quote.quote_options || []).find((item: { id: string }) => item.id === quote.selected_option_id) || quote.quote_options?.[0];
  if (!option) return NextResponse.json({ received: true, warning: "Paid quote has no tire option" });

  const taxable = Number(option.price_per_tire) * Number(quote.quantity) + Number(quote.installation_cost) + Number(quote.service_call_fee) + Number(quote.disposal_fee);
  const scheduled = quote.requested_date && quote.requested_time ? `${quote.requested_date}T${String(quote.requested_time).substring(0, 5)}:00` : null;
  const { data: createdJob, error: jobError } = await admin.from("jobs").insert({
    source_quote_id: quote.id, customer: quote.customer, contact_name: quote.contact_name, phone: quote.phone, email: quote.email,
    vehicle: quote.vehicle, address: quote.address, scheduled, tires: `${option.brand} ${option.model}`, size: quote.tire_size, qty: quote.quantity,
    price_tires: Number(option.price_per_tire), installation_cost: Number(quote.installation_cost) + Number(quote.service_call_fee),
    tire_supplier: option.supplier || "ATD", tire_product_number: option.supplier_product_id || option.manufacturer_product_id || null,
    tire_disposal_fee: Number(quote.disposal_fee), ny_state_tire_fee: Number(quote.ny_state_tire_fee), subtotal: taxable + Number(quote.ny_state_tire_fee),
    sales_tax_amount: salesTax, sales_tax_rate: taxable > 0 ? salesTax / taxable * 100 : 0, tax_exempt: false, job_total: amountPaid,
    payment_status: "paid", paid_date: paidAt, tires_ordered: false,
    notes: [quote.notes, `Paid website order from quote #${quote.quote_number}. Order tires before the appointment.`].filter(Boolean).join("\n"),
    complete: false, archived: false, vehicle_id: "stepvan", job_status: scheduled ? "scheduled" : "paid",
  }).select("id").single();

  let jobId = createdJob?.id;
  if (jobError?.code === "23505") {
    const { data: existing } = await admin.from("jobs").select("id").eq("source_quote_id", quote.id).single();
    jobId = existing?.id;
  } else if (jobError) {
    return NextResponse.json({ error: `Payment recorded, but job creation failed: ${jobError.message}` }, { status: 500 });
  }
  if (jobId) await admin.from("quotes").update({ status: "converted", converted_job_id: jobId, appointment_hold_expires_at: null, updated_at: paidAt }).eq("id", quote.id);
  return NextResponse.json({ received: true, jobId });
}
