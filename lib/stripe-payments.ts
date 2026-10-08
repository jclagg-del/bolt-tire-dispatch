import "server-only";

export class StripePaymentError extends Error {
  constructor(message: string, public status: number, public paymentIntent?: Record<string, any>) { super(message); }
}
export async function stripePaymentRequest(path: string, body?: URLSearchParams, idempotencyKey?: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body, signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok) throw new StripePaymentError(result.error?.message || "Stripe could not complete the request.", response.status, result.error?.payment_intent);
  return result;
}

/** One normalized receipt interface, retaining the real object URL for durable
 * email receipts. Old Checkout Sessions and new PaymentIntents remain supported. */
export function stripeReceiptUrl(id: string) {
  if (/^cs_[A-Za-z0-9_]+$/.test(id)) return `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`;
  if (/^pi_[A-Za-z0-9]+$/.test(id)) return `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}`;
  throw new Error("Missing payment checkout session or intent");
}
export function normalizeStripeReceipt(record: Record<string, any>) {
  if (record.object !== "payment_intent") return record;
  return {
    ...record,
    payment_status: record.status === "succeeded" && record.amount_received === record.amount ? "paid" : "unpaid",
    amount_total: record.amount_received,
    customer_email: record.receipt_email,
  };
}
