import "server-only";
import { stripeReceiptUrl, normalizeStripeReceipt } from "@/lib/stripe-payments";
import { websiteTireItems, type WebsiteOption, type WebsiteQuote } from "@/lib/paid-website-order";
import { renderCustomerConfirmationEmail } from "@/lib/customer-confirmation-email";

const receiptKey = "bolt_customer_payment_email";
const validEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Separate from the office alert: a successful office email must never suppress
// the customer's receipt, and neither email places an order with a supplier.
export async function sendCustomerPaymentConfirmation(sessionId: string, quote: WebsiteQuote, option: WebsiteOption) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!stripeKey || !resendKey) throw new Error("Customer confirmation email is not configured");
  const sessionUrl = stripeReceiptUrl(sessionId);
  const authorization = { Authorization: `Bearer ${stripeKey}` };
  const checked = await fetch(sessionUrl, { headers: authorization, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!checked.ok) throw new Error(`Could not verify customer payment (${checked.status})`);
  const session = normalizeStripeReceipt(await checked.json());
  if (session.payment_status !== "paid" || session.metadata?.quote_id !== quote.id || (session.metadata?.option_id && session.metadata.option_id !== option.id)) {
    throw new Error("Customer confirmation does not match a paid quote");
  }
  if (session.metadata?.[receiptKey]) return;
  const email = quote.email?.trim() || session.customer_details?.email || session.customer_email;
  if (!validEmail(email)) throw new Error("Paid order has no valid customer email for confirmation");
  if (!Number.isSafeInteger(session.amount_total) || session.amount_total < 0) throw new Error("Paid order has an invalid payment amount");
  const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: String(session.currency || "usd").toUpperCase() }).format(amount);
  const amount = money(session.amount_total / 100);
  // Quote numbers are stable before and after conversion to an order or job.
  const orderNumber = `BT-${quote.quote_number}`;
  const tires = websiteTireItems(quote, option).map(item => `${item.quantity} × ${item.size} ${item.brand} ${item.model}${item.part ? ` · Part #${item.part}` : ""}`);
  const extras = (quote.additional_items || []).map(item => `${item.quantity} × ${item.description}`);
  const requested = [quote.requested_date, quote.requested_time].filter(Boolean).join(" at ");
  const details = [
    ["Order number", orderNumber], ["Quote reference", `#${quote.quote_number}`], ["Amount paid", amount],
    ["Payment status", "Paid — payment received"], ["Customer", quote.contact_name || quote.customer],
    ["Vehicle", quote.vehicle || "Not provided"], ["Service address", quote.address || "Not provided"],
    ["Requested appointment", requested ? `${requested} (pending confirmation)` : "Not scheduled — we will contact you to arrange the next steps"],
  ];
  const next = "We have received your order and payment. Your requested appointment is not confirmed until our team confirms it. This email is a payment confirmation, not a shipment or delivery notice. Reply to this email with your order number for an order-status update.";
  const subject = `Bolt Tire order confirmation | ${orderNumber} | ${amount} paid`;
  const body = {
    from: process.env.KINGDOM_NOTIFICATION_FROM || "Bolt Tire <no-reply@bolttire.com>",
    to: [email], reply_to: "sales@bolttire.com", subject,
    text: ["Thank you for your order!", ...details.map(([key, value]) => `${key}: ${value}`), "Tires:", ...tires,
      ...(extras.length ? ["Additional items / services:", ...extras] : []), next, "Bolt Tire · sales@bolttire.com"].join("\n"),
    html: renderCustomerConfirmationEmail({ amount, orderNumber, details, tires, extras, next }),
  };
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `customer-paid-checkout-${sessionId}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const result = await sent.json().catch(() => ({}));
  if (!sent.ok || !result.id) throw new Error(`Customer confirmation email was not accepted (${sent.status})`);
  // The durable Stripe receipt prevents duplicate mail beyond the provider's
  // 24-hour idempotency window. A failed write causes a retry with the same key.
  const receipt = await fetch(sessionUrl, {
    method: "POST", headers: { ...authorization, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ [`metadata[${receiptKey}]`]: String(result.id) }), signal: AbortSignal.timeout(15000),
  });
  if (!receipt.ok) throw new Error(`Could not save customer confirmation receipt (${receipt.status})`);
}
