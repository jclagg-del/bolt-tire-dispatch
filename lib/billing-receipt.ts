import "server-only";
import { createHash } from "node:crypto";
import { stripePaymentRequest } from "@/lib/stripe-payments";
import { quickBooksRequest } from "@/lib/quickbooks";

export class BillingReceiptError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type BillingReceipt = {
  jobId: string; email: string; customer: string; reference: string;
  amountCents: number; taxCents: number | null; paidDate: string;
  source: "Stripe" | "QuickBooks" | "Recorded payment"; receiptUrl: string | null;
};
const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const cents = (value: unknown) => value === null || value === undefined || value === "" ? NaN : Math.round(Number(value) * 100);
const money = (value: number) => (value / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function receiptFingerprint(receipt: BillingReceipt) {
  // A hosted receipt URL can rotate without the underlying payment changing.
  const { receiptUrl: _url, ...values } = receipt;
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export async function billingReceipt(admin: any, jobId: string): Promise<BillingReceipt> {
  const { data: job, error } = await admin.from("jobs").select("id,customer,contact_name,email,po_number,invoice_number,quickbooks_invoice_id,source_quote_id,payment_status,job_total,paid_date,sales_tax_amount").eq("id", jobId).maybeSingle();
  if (error) throw new BillingReceiptError("Could not load this payment. Please try again.", 503);
  if (!job) throw new BillingReceiptError("Job not found.", 404);
  if (job.payment_status !== "paid") throw new BillingReceiptError("A receipt can only be sent for a fully paid job.");
  let query = admin.from("quotes").select("id,quote_number,email,payment_status,amount_paid,paid_at,stripe_payment_intent_id,stripe_sales_tax_amount");
  query = job.source_quote_id ? query.eq("id", job.source_quote_id) : query.eq("converted_job_id", job.id);
  const quoteResult = await query.maybeSingle();
  if (quoteResult.error || (job.source_quote_id && !quoteResult.data)) throw new BillingReceiptError("Could not verify the linked quote. Review it before sending a receipt.", 409);
  const quote = quoteResult.data;
  const receipt: BillingReceipt = {
    jobId: String(job.id), email: String(job.email || quote?.email || "").trim(),
    customer: job.contact_name || job.customer || "Customer",
    reference: quote ? `BT-${quote.quote_number}` : job.invoice_number ? `Invoice ${job.invoice_number}` : `Job ${job.po_number || job.id}`,
    amountCents: cents(job.job_total), taxCents: job.sales_tax_amount == null ? null : cents(job.sales_tax_amount),
    paidDate: String(job.paid_date || ""), source: "Recorded payment", receiptUrl: null,
  };
  if (quote?.stripe_payment_intent_id) {
    if (quote.payment_status !== "paid" || !/^pi_[A-Za-z0-9]+$/.test(quote.stripe_payment_intent_id)) throw new BillingReceiptError("The linked online payment is not fully paid.");
    const payment = await stripePaymentRequest(`payment_intents/${encodeURIComponent(quote.stripe_payment_intent_id)}?expand[]=latest_charge`);
    const charge = payment.latest_charge;
    if (payment.status !== "succeeded" || payment.livemode !== true || payment.currency !== "usd"
      || payment.metadata?.quote_id !== quote.id || payment.amount_received !== cents(quote.amount_paid)
      || !charge || typeof charge !== "object" || charge.payment_intent !== payment.id
      || charge.paid !== true || charge.captured !== true || charge.currency !== "usd"
      || charge.amount !== payment.amount_received || charge.amount_refunded !== 0 || charge.refunded || charge.disputed) {
      throw new BillingReceiptError("This Stripe payment needs review (unsettled, refunded, disputed, or mismatched). No receipt was sent.", 409);
    }
    const url = new URL(charge.receipt_url || "https://invalid.local");
    if (url.protocol !== "https:" || url.hostname !== "pay.stripe.com" || !url.pathname.startsWith("/receipts/")) throw new BillingReceiptError("Stripe has not provided a valid receipt link.", 409);
    receipt.amountCents = payment.amount_received;
    receipt.taxCents = quote.stripe_sales_tax_amount == null ? null : cents(quote.stripe_sales_tax_amount);
    receipt.paidDate = quote.paid_at || "";
    receipt.source = "Stripe";
    receipt.receiptUrl = url.href;
  } else if (job.quickbooks_invoice_id) {
    if (!/^\d+$/.test(String(job.quickbooks_invoice_id))) throw new BillingReceiptError("Invalid QuickBooks invoice reference.");
    const { Invoice: invoice } = await quickBooksRequest(`/invoice/${job.quickbooks_invoice_id}`);
    if (!invoice || String(invoice.Id) !== String(job.quickbooks_invoice_id) || Number(invoice.Balance) !== 0
      || (invoice.CurrencyRef?.value && invoice.CurrencyRef.value !== "USD")) throw new BillingReceiptError("QuickBooks does not show this invoice as fully paid. Sync or review it first.", 409);
    // A zero balance can also come from credits or a write-off. Confirm actual
    // payments applied to this invoice before describing the total as paid.
    const links = invoice.LinkedTxn || [];
    if (!links.length || links.some((link: any) => link.TxnType !== "Payment" || !/^\d+$/.test(String(link.TxnId)))) throw new BillingReceiptError("This invoice has credits or no verifiable payment. Review it in QuickBooks before sending a receipt.", 409);
    let applied = 0;
    for (const id of new Set<string>(links.map((link: any) => String(link.TxnId)))) {
      const { Payment: payment } = await quickBooksRequest(`/payment/${id}`);
      if (!payment || String(payment.Id) !== id || (payment.CurrencyRef?.value && payment.CurrencyRef.value !== "USD")) throw new BillingReceiptError("Could not verify the QuickBooks invoice payment.", 409);
      for (const line of payment.Line || []) {
        if ((line.LinkedTxn || []).some((link: any) => link.TxnType === "Invoice" && String(link.TxnId) === String(invoice.Id))) applied += cents(line.Amount);
      }
    }
    if (!Number.isSafeInteger(applied) || applied !== cents(invoice.TotalAmt)) throw new BillingReceiptError("QuickBooks payments do not match the invoice total. Review credits or adjustments before sending a receipt.", 409);
    receipt.amountCents = cents(invoice.TotalAmt);
    receipt.taxCents = invoice.TxnTaxDetail?.TotalTax == null ? null : cents(invoice.TxnTaxDetail.TotalTax);
    receipt.reference = `Invoice ${invoice.DocNumber || job.invoice_number || invoice.Id}`;
    // A sync timestamp is not the customer's actual payment date.
    receipt.paidDate = "";
    receipt.source = "QuickBooks";
  } else if (quote && quote.payment_status !== "paid") {
    throw new BillingReceiptError("The linked quote is not paid. Review the payment record first.", 409);
  }
  if (!validEmail(receipt.email)) throw new BillingReceiptError("Add a valid customer email to this job before sending a receipt.");
  if (!Number.isSafeInteger(receipt.amountCents) || receipt.amountCents <= 0
    || (receipt.taxCents !== null && (!Number.isSafeInteger(receipt.taxCents) || receipt.taxCents < 0 || receipt.taxCents > receipt.amountCents))) {
    throw new BillingReceiptError("The saved payment amount or tax needs review before sending a receipt.", 409);
  }
  if (receipt.paidDate && !Number.isFinite(new Date(receipt.paidDate).getTime())) throw new BillingReceiptError("The recorded payment date needs review.", 409);
  return receipt;
}

export function renderBillingReceipt(receipt: BillingReceipt) {
  const date = receipt.paidDate ? new Date(receipt.paidDate).toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" }) : "";
  const rows = [["Customer", receipt.customer], ["Order / invoice", receipt.reference], ...(date ? [[receipt.source === "Recorded payment" ? "Recorded paid date" : "Payment date", date]] : []), ["Amount paid", money(receipt.amountCents)], ...(receipt.taxCents !== null ? [["Sales tax included", money(receipt.taxCents)]] : []), ["Balance due", "$0.00"]];
  const note = "This is a receipt for payment already received. No additional payment is required.";
  const text = ["Bolt Tire — Payment receipt", ...rows.map(([label, value]) => `${label}: ${value}`), note, ...(receipt.receiptUrl ? [`View or print your Stripe receipt: ${receipt.receiptUrl}`] : []), "Thank you for choosing Bolt Tire!", "sales@bolttire.com"].join("\n");
  const html = `<div style="background:#f1f5f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:600px;margin:auto;background:white;border-radius:16px;overflow:hidden"><div style="padding:28px;border-bottom:5px solid #facc15"><img src="https://app.bolttire.com/bolt-logo.png" alt="Bolt Tire" width="220" style="max-width:100%;height:auto" /></div><div style="padding:28px;background:#0f172a;color:white"><p style="color:#facc15;font-weight:bold">PAYMENT RECEIPT</p><h1 style="margin:8px 0">${escape(money(receipt.amountCents))} paid</h1><p>${escape(receipt.reference)}</p></div><div style="padding:28px"><table style="width:100%;border-collapse:collapse">${rows.map(([label,value])=>`<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0">${escape(label)}</td><td style="padding:10px 0;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:bold">${escape(value)}</td></tr>`).join("")}</table><p style="line-height:1.6">${note}</p>${receipt.receiptUrl ? `<p><a href="${escape(receipt.receiptUrl)}" style="display:inline-block;padding:14px 20px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold">View / print Stripe receipt</a></p>` : ""}<p>Thank you for choosing Bolt Tire!</p><a href="mailto:sales@bolttire.com">sales@bolttire.com</a></div></div></div>`;
  return { text, html, subject: `Bolt Tire receipt | ${receipt.reference} | ${money(receipt.amountCents)} paid` };
}

export async function sendBillingReceipt(receipt: BillingReceipt) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new BillingReceiptError("Receipt email is not configured.", 503);
  const day = new Date().toISOString().slice(0, 10);
  const body = { from: process.env.KINGDOM_NOTIFICATION_FROM || "Bolt Tire <no-reply@bolttire.com>", to: [receipt.email], reply_to: "sales@bolttire.com", ...renderBillingReceipt(receipt) };
  // Repeated clicks/retries for the same receipt today cannot send duplicates.
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `billing-receipt-${receiptFingerprint(receipt)}-${day}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) throw new BillingReceiptError("The email provider could not confirm the receipt was sent. Please retry; repeated sends today are protected against duplicates.", 502);
  return { sent: true, email: receipt.email, amountCents: receipt.amountCents };
}
