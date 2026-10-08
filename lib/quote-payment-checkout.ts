import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripePaymentRequest, StripePaymentError } from "@/lib/stripe-payments";
import { verifiedPaymentPricing } from "@/lib/payment-method-pricing";
import { quotePaymentPrice, type PaymentPriceSnapshot } from "@/lib/quote-payment-pricing";
import { lookupDiscount } from "@/lib/discounts-server";
import { shopCustomerError } from "@/lib/shop-customer";
import { quoteCheckoutDetailsError, quoteCheckoutDetails } from "@/lib/quote-checkout-details";
import { serviceTaxAddress, serviceAddressPrefill, formatServiceTaxAddress } from "@/lib/service-tax-address";

type Admin = ReturnType<typeof createAdminClient>;
export type PaymentAttempt = {
  id: string; quote_id: string; option_id: string; confirmation_token: string;
  state: string; funding: string; payment_method_type: string;
  stripe_payment_intent_id?: string | null; stripe_payment_method_id?: string | null;
  snapshot: PaymentPriceSnapshot; amount_cents: number; tax_cents: number;
  tax_calculation_id?: string | null; expires_at: string; submitted_at?: string | null;
};
export async function validatePaymentQuote(q: Record<string, any>) {
  if (q.payment_pricing_version !== 1 || q.stripe_checkout_session_id) throw new Error("This quote uses its original payment checkout.");
  if (["paid", "refunded"].includes(q.payment_status) || q.converted_job_id) throw new Error("This quote is already paid or converted.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (q.expires_at && q.expires_at < today) throw new Error("This quote has expired.");
  const error = q.purchase_source === "website" ? shopCustomerError({ ...q, name: q.contact_name || q.customer }) : quoteCheckoutDetailsError(quoteCheckoutDetails(q));
  if (error) throw new Error(error);
  if (q.discount_code_id) {
    const discount = await lookupDiscount(q.discount_code_label);
    if (!discount || discount.id !== q.discount_code_id || Number(discount.percent) !== Number(q.discount_percent) || (discount.discount_type || "percent") !== (q.discount_type || "percent") || Number(discount.fixed_amount || 0) !== Number(q.discount_fixed_amount || 0) || discount.tax_exempt !== q.tax_exempt || discount.organization !== q.discount_organization) throw new Error("Discount settings changed. Return to checkout and apply the code again.");
  }
}
const assertMode = (object: { livemode?: boolean }) => {
  const live = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || "");
  if (typeof object.livemode !== "boolean" || object.livemode !== live) throw new Error("Stripe payment environment mismatch.");
};
export const paymentSourceFields = ["quantity", "rear_quantity", "installation_cost", "service_call_fee", "disposal_fee", "ny_state_tire_fee", "tax_exempt", "additional_items", "customer", "contact_name", "email", "phone", "address", "vehicle", "requested_date", "requested_time", "discount_code_id", "discount_code_label", "discount_type", "discount_percent", "discount_fixed_amount", "discount_organization"];

export async function reviewQuotePayment(admin: Admin, q: Record<string, any>, optionId: string, confirmationToken: string, enteredServiceAddress?: unknown) {
  await validatePaymentQuote(q);
  if (!/^ctoken_[A-Za-z0-9]+$/.test(confirmationToken)) throw new Error("Enter payment details before reviewing the total.");
  const option = q.quote_options.find((o: { id: string }) => o.id === optionId);
  if (!option) throw new Error("Choose a valid tire option.");
  const active = await admin.from("quote_payment_attempts").select("id,state,expires_at").eq("quote_id", q.id).not("state", "in", "(failed,canceled,expired)").maybeSingle();
  if (active.error) throw new Error("Payment history could not be checked.");
  if (active.data && !(active.data.state === "review" && new Date(active.data.expires_at) <= new Date())) throw new Error("A payment is already open. Resume it or cancel its review before trying again.");
  const address = serviceTaxAddress(enteredServiceAddress ?? serviceAddressPrefill(q.address));
  const formattedAddress = formatServiceTaxAddress(address);
  if (formattedAddress !== q.address) {
    // Save the customer-confirmed destination, not a tax-only override. The
    // existing trigger and reservation lock prevent changing an active purchase.
    let update = admin.from("quotes").update({ address: formattedAddress, updated_at: new Date().toISOString() }).eq("id", q.id).eq("address", q.address);
    update = q.payment_status == null ? update.is("payment_status", null) : update.eq("payment_status", q.payment_status);
    const saved = await update.select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("The service address could not be saved. Refresh and review the order before paying.");
    q = { ...q, address: formattedAddress };
  }
  const token = await stripePaymentRequest(`confirmation_tokens/${confirmationToken}`);
  assertMode(token);
  if (token.payment_intent || token.setup_intent || !token.expires_at || token.expires_at * 1000 < Date.now() + 60000) throw new Error("Payment details expired or were already used. Enter them again.");
  const pricing = verifiedPaymentPricing(token.payment_method_preview);
  const funding = token.payment_method_preview.type === "card" ? token.payment_method_preview.card.funding : "us_bank_account";
  const snapshot = quotePaymentPrice(q as any, option, pricing);
  snapshot.taxAddress = address;
  snapshot.taxAddressSource = "shipping";
  let amountCents = snapshot.subtotalCents, taxCents = 0, taxCalculationId: string | null = null;
  if (!q.tax_exempt) {
    const params = new URLSearchParams({ currency: "usd", "customer_details[address_source]": "shipping" });
    for (const field of ["line1", "line2", "city", "state", "postal_code", "country"] as const) if (address[field]) params.set(`customer_details[address][${field}]`, address[field]);
    snapshot.lines.forEach((line, i) => {
      params.set(`line_items[${i}][amount]`, String(line.amount));
      params.set(`line_items[${i}][reference]`, line.reference);
      params.set(`line_items[${i}][tax_behavior]`, "exclusive");
      params.set(`line_items[${i}][tax_code]`, line.taxable ? "txcd_99999999" : "txcd_00000000");
    });
    const tax = await stripePaymentRequest("tax/calculations", params, `quote-tax-${q.id}-${confirmationToken}`);
    if (!Number.isSafeInteger(tax.amount_total) || tax.amount_total > 99_999_999 || !Number.isSafeInteger(tax.tax_amount_exclusive) || tax.tax_amount_exclusive < 0 || tax.amount_total !== snapshot.subtotalCents + tax.tax_amount_exclusive || tax.tax_amount_inclusive !== 0) throw new Error("Stripe returned inconsistent tax totals.");
    // Do not silently collect zero NY tax because registration is missing.
    if (address.state === "NY" && address.country === "US" && snapshot.taxableCents > 0 && tax.tax_amount_exclusive === 0) throw new Error("Sales tax could not be verified. Please contact Bolt Tire before paying.");
    taxCalculationId = tax.id; amountCents = tax.amount_total; taxCents = tax.tax_amount_exclusive;
  }
  const id = randomUUID();
  const attempt = {
    id, confirmation_token: confirmationToken, funding, payment_method_type: token.payment_method_preview.type,
    snapshot, tax_calculation_id: taxCalculationId, amount_cents: amountCents, tax_cents: taxCents,
    expires_at: new Date(Math.min(Date.now() + 10 * 60000, token.expires_at * 1000 - 30000)).toISOString(),
    source_quote: Object.fromEntries(paymentSourceFields.filter(field => q[field] !== undefined).map(field => [field, q[field]])), source_option: option,
  };
  const saved = await admin.rpc("reserve_quote_payment", { p_quote_id: q.id, p_option_id: optionId, p_attempt: attempt });
  if (saved.error) throw new Error(saved.error.message);
  return paymentReview(saved.data as PaymentAttempt);
}
export function paymentReview(a: PaymentAttempt) {
  return { reviewId: a.id, state: a.state, funding: a.funding, pricing: a.snapshot.pricing, subtotal: a.snapshot.subtotalCents / 100, tax: a.tax_cents / 100, total: a.amount_cents / 100, expiresAt: a.expires_at, serviceAddress: a.snapshot.taxAddress ? formatServiceTaxAddress(a.snapshot.taxAddress) : null };
}
export function paymentNextAction(intent: Record<string, any>) {
  if (intent.status !== "requires_action") return {};
  if (intent.next_action?.type === "verify_with_microdeposits") {
    const raw = intent.next_action.verify_with_microdeposits?.hosted_verification_url;
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error("Bank verification link is unavailable. Contact Bolt Tire; do not submit another payment."); }
    if (url.origin !== "https://payments.stripe.com" || url.username || url.password) throw new Error("Bank verification link could not be verified.");
    return { bankVerificationUrl: url.href };
  }
  return { clientSecret: intent.client_secret };
}
export async function syncPaymentAttempt(admin: Admin, a: PaymentAttempt, intent: Record<string, any>) {
  assertMode(intent);
  if (intent.metadata?.bolt_payment_attempt !== a.id || intent.metadata?.quote_id !== a.quote_id || intent.metadata?.option_id !== a.option_id || intent.currency !== "usd" || intent.amount !== a.amount_cents || (a.stripe_payment_intent_id && intent.id !== a.stripe_payment_intent_id)) throw new Error("Payment does not match the saved order. Contact Bolt Tire.");
  const method = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
  if (a.stripe_payment_method_id && method !== a.stripe_payment_method_id && !(method == null && ["requires_payment_method", "canceled"].includes(intent.status))) throw new Error("The payment method changed after review.");
  const states: Record<string, string> = { succeeded: "succeeded", processing: "processing", requires_capture: "processing", requires_action: "requires_action", requires_confirmation: "requires_confirmation", requires_payment_method: "failed", canceled: "canceled" };
  const state = states[intent.status];
  if (!state) throw new Error("Unexpected payment status. Contact Bolt Tire before retrying.");
  if (intent.status === "succeeded" && intent.amount_received !== a.amount_cents) throw new Error("Received payment amount does not match the order.");
  const saved = await admin.rpc("sync_quote_payment", { p_quote_id: a.quote_id, p_attempt_id: a.id, p_state: state, p_intent_id: intent.id, p_method_id: method || null });
  if (saved.error) throw new Error("Could not save payment status. Do not submit another payment.");
  Object.assign(a, saved.data);
  return a;
}
/** Card authorization is not payment. Verify the bound card before server-only capture. */
export async function finalizeQuotePayment(admin: Admin, a: PaymentAttempt, intent: Record<string, any>) {
  await syncPaymentAttempt(admin, a, intent);
  if (intent.status !== "requires_capture") return intent;
  if (a.payment_method_type !== "card" || intent.capture_method !== "manual" || intent.amount_capturable !== a.amount_cents || !a.stripe_payment_method_id) throw new Error("Card authorization needs review before capture.");
  const method = await stripePaymentRequest(`payment_methods/${a.stripe_payment_method_id}`);
  assertMode(method);
  if (method.id !== a.stripe_payment_method_id || method.type !== "card" || method.card?.funding !== a.funding || verifiedPaymentPricing(method) !== a.snapshot.pricing) throw new Error("Card funding changed after review. Payment was not captured; contact Bolt Tire.");
  // Both the browser response and webhook may reach this path. One stable key
  // captures the exact reviewed amount once, even after a lost response.
  const captured = await stripePaymentRequest(`payment_intents/${intent.id}/capture`, new URLSearchParams({ amount_to_capture: String(a.amount_cents) }), `quote-capture-${a.id}`);
  await syncPaymentAttempt(admin, a, captured);
  return captured;
}
export async function confirmQuotePayment(admin: Admin, quoteId: string, attemptId: string) {
  const reserved = await admin.rpc("submit_quote_payment", { p_quote_id: quoteId, p_attempt_id: attemptId });
  if (reserved.error) throw new Error(reserved.error.message);
  const a = reserved.data as PaymentAttempt;
  let intent;
  if (a.stripe_payment_intent_id) {
    intent = await stripePaymentRequest(`payment_intents/${a.stripe_payment_intent_id}`);
    await syncPaymentAttempt(admin, a, intent);
  } else {
    if (!a.submitted_at || Date.now() - new Date(a.submitted_at).getTime() > 23 * 3600000) throw new Error("Payment needs manual review before another charge can be attempted.");
    const body = new URLSearchParams({
      amount: String(a.amount_cents), currency: "usd", confirm: "true", confirmation_method: "automatic",
      use_stripe_sdk: "true",
      confirmation_token: a.confirmation_token, "payment_method_types[0]": a.payment_method_type,
      "metadata[quote_id]": quoteId, "metadata[option_id]": a.option_id, "metadata[bolt_payment_attempt]": a.id,
      description: "Bolt Tire quote payment",
    });
    if (a.payment_method_type === "card") body.set("capture_method", "manual");
    if (a.tax_calculation_id) body.set("hooks[inputs][tax][calculation]", a.tax_calculation_id);
    try { intent = await stripePaymentRequest("payment_intents", body, `quote-payment-${a.id}`); }
    catch (error) {
      if (error instanceof StripePaymentError && error.paymentIntent) {
        await syncPaymentAttempt(admin, a, error.paymentIntent);
      }
      // Unknown outcomes stay locked. Retry uses the identical Stripe key.
      throw error;
    }
  }
  intent = await finalizeQuotePayment(admin, a, intent);
  return { ...paymentReview(a), status: intent.status, ...paymentNextAction(intent) };
}
