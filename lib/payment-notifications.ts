import "server-only";
import { stripeReceiptUrl, normalizeStripeReceipt } from "@/lib/stripe-payments";
import { websiteTireItems, type WebsiteOption, type WebsiteQuote } from "@/lib/paid-website-order";

type PaidQuote = WebsiteQuote & { purchase_source?: string | null };
const receiptKey = "bolt_office_payment_email";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** Stripe stores a durable receipt; Resend also deduplicates simultaneous deliveries.
 * Only notification metadata is updated here. No payment or supplier order is created.
 */
export async function sendPaymentNotification(sessionId: string, quote: PaidQuote, option: WebsiteOption) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!stripeKey || !resendKey) throw new Error("Payment notification email is not configured");
  const sessionUrl = stripeReceiptUrl(sessionId);
  const authorization = { Authorization: `Bearer ${stripeKey}` };
  const response = await fetch(sessionUrl, { headers: authorization, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Could not check payment notification receipt (${response.status})`);
  const session = normalizeStripeReceipt(await response.json());
  if (session.payment_status !== "paid" || session.metadata?.quote_id !== quote.id) {
    throw new Error("Payment notification does not match a paid quote");
  }
  if (session.metadata?.[receiptKey]) return;

  const website = quote.purchase_source === "website";
  const label = website ? "ONLINE PURCHASE PAID" : "QUOTE PAID";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: String(session.currency || "usd").toUpperCase() }).format(Number(session.amount_total) / 100);
  const tires = websiteTireItems(quote, option).map(item =>
    `${item.quantity} × ${item.size} ${item.brand} ${item.model}${item.part ? ` · Part #${item.part}` : ""}`);
  // A stable quote link also works after conversion and avoids changing the email
  // payload between Stripe retries (Resend requires the same idempotent payload).
  const quoteUrl = `https://app.bolttire.com/quotes/${encodeURIComponent(quote.id)}`;
  const details = [
    ["Quote", `#${quote.quote_number}`], ["Amount paid", amount],
    ["Customer", quote.customer], ["Contact", quote.contact_name || quote.customer],
    ["Phone", quote.phone || "Not provided"], ["Email", quote.email || "Not provided"],
    ["Vehicle", quote.vehicle || "Not provided"], ["Service address", quote.address || "Not provided"],
    ["Requested appointment", [quote.requested_date, quote.requested_time].filter(Boolean).join(" at ") || "Not scheduled"],
    ...(quote.discount_organization ? [["Organization", quote.discount_organization]] : []),
    ...(quote.discount_code_label ? [["Discount code", quote.discount_code_label]] : []),
  ];
  const nextStep = website
    ? "Customer payment is confirmed. This payment does not purchase tires from a supplier. Check the order/job before ordering tires."
    : "Customer payment is confirmed. Review the quote and any linked job for the next steps. This payment does not purchase tires from a supplier.";
  const ordersLink = website && quote.discount_organization
    ? '<p><a href="https://app.bolttire.com/orders">Open Orders</a></p>' : "";
  const email = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `paid-checkout-${sessionId}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      from: process.env.KINGDOM_NOTIFICATION_FROM || "Bolt Tire <no-reply@bolttire.com>",
      to: [process.env.NEW_ORDER_NOTIFICATION_EMAIL || "office@bolttire.com"],
      reply_to: "office@bolttire.com",
      subject: `${label} | Quote #${quote.quote_number} | ${quote.customer} | ${amount}`,
      text: [label, ...details.map(([key, value]) => `${key}: ${value}`), "Tires:", ...tires, nextStep, `Open quote: ${quoteUrl}`, ...(ordersLink ? ["Open Orders: https://app.bolttire.com/orders"] : [])].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;color:#111827"><h2>${escapeHtml(label)}</h2>${details.map(([key, value]) => `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</p>`).join("")}<h3>Tires</h3><ul>${tires.map(tire => `<li>${escapeHtml(tire)}</li>`).join("")}</ul><p>${escapeHtml(nextStep)}</p><p><a href="${quoteUrl}">Open quote</a></p>${ordersLink}</div>`,
    }),
  });
  const result = await email.json().catch(() => ({}));
  if (!email.ok || !result.id) throw new Error(`Payment notification email was not accepted (${email.status})`);

  // Persist only after the mail provider accepts the message. If this write fails,
  // return an error so Stripe retries using the SAME email idempotency key.
  const receipt = await fetch(sessionUrl, {
    method: "POST", headers: { ...authorization, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ [`metadata[${receiptKey}]`]: String(result.id) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!receipt.ok) throw new Error(`Could not save payment notification receipt (${receipt.status})`);
}
