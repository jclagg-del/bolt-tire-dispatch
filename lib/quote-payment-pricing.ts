import { AdditionalItem, additionalItemAmount, additionalItemsError } from "@/lib/additional-items";
import { paymentPricePair, type VerifiedPaymentPricing } from "@/lib/payment-method-pricing";
import type { ServiceTaxAddress } from "@/lib/service-tax-address";

// Keep rollout off until database, Stripe event delivery and browser QA are ready.
export const paymentMethodPricingEnabled = () => process.env.NEXT_PUBLIC_PAYMENT_METHOD_PRICING_ENABLED === "true";
export type PricedQuote = {
  quantity: number; rear_quantity?: number | null;
  installation_cost: number; service_call_fee: number; disposal_fee: number;
  ny_state_tire_fee: number; tax_exempt: boolean; additional_items?: AdditionalItem[];
};
export type PricedOption = { id: string; price_per_tire: number; rear_price_per_tire?: number | null };
export type PaymentPriceSnapshot = {
  taxAddress?: ServiceTaxAddress;
  taxAddressSource?: "shipping";
  pricing: VerifiedPaymentPricing;
  quote: Pick<PricedQuote, "installation_cost" | "service_call_fee" | "disposal_fee" | "ny_state_tire_fee" | "additional_items">;
  option: PricedOption;
  subtotalCents: number; taxableCents: number; nonTaxableCents: number;
  lines: { reference: string; amount: number; taxable: boolean }[];
};
export function cents(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 999999.99) throw new Error("Invalid saved price.");
  return Math.round((number + Number.EPSILON) * 100);
}
export function quotePaymentPrice(q: PricedQuote, o: PricedOption, pricing: VerifiedPaymentPricing): PaymentPriceSnapshot {
  const quantity = Number(q.quantity), rearQuantity = Number(q.rear_quantity || 0);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || !Number.isInteger(rearQuantity) || rearQuantity < 0 || rearQuantity > 10000) throw new Error("Invalid saved tire quantity.");
  const extrasError = additionalItemsError(q.additional_items || []);
  if (extrasError) throw new Error(extrasError);
  // Price each invoice unit consistently, then extend by quantity. No hidden
  // adjustment line or percentage-off rounding error when the job is invoiced.
  const price = (value: unknown) => {
    const base = cents(value);
    return (pricing === "regular" ? paymentPricePair(base).regularCents : base) / 100;
  };
  const option = { id: o.id, price_per_tire: price(o.price_per_tire), rear_price_per_tire: rearQuantity ? price(o.rear_price_per_tire || 0) : null };
  const quote = {
    installation_cost: price(q.installation_cost), service_call_fee: price(q.service_call_fee),
    disposal_fee: price(q.disposal_fee), ny_state_tire_fee: cents(q.ny_state_tire_fee) / 100,
    additional_items: (q.additional_items || []).map(item => ({ ...item, unit_price: price(item.unit_price) })),
  };
  const lines = [
    { reference: "front_tires", amount: cents(option.price_per_tire * quantity), taxable: true },
    { reference: "rear_tires", amount: cents(Number(option.rear_price_per_tire) * rearQuantity), taxable: true },
    ...["installation_cost", "service_call_fee", "disposal_fee"].map(field => ({ reference: field, amount: cents(quote[field as "installation_cost"]), taxable: true })),
    { reference: "ny_state_tire_fee", amount: cents(quote.ny_state_tire_fee), taxable: false },
    ...quote.additional_items.map((item, index) => ({ reference: `extra_${index}`, amount: cents(additionalItemAmount(item)), taxable: item.taxable })),
  ].filter(line => line.amount > 0);
  const subtotalCents = lines.reduce((sum, line) => sum + line.amount, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 50 || subtotalCents > 99_999_999) throw new Error("Payment total is outside the supported range.");
  const taxableCents = lines.filter(line => line.taxable).reduce((sum, line) => sum + line.amount, 0);
  return { pricing, quote, option, lines, subtotalCents, taxableCents, nonTaxableCents: subtotalCents - taxableCents };
}

/** Overlay the settled snapshot for display/conversion without changing the
 * original quote's agreed base prices or recalculating historical payments. */
export function settledQuote<T extends { payment_status?: string; payment_pricing_snapshot?: PaymentPriceSnapshot | null; quote_options?: PricedOption[] }>(quote: T): T {
  const snapshot = quote.payment_pricing_snapshot;
  if (quote.payment_status !== "paid" || !snapshot) return quote;
  return { ...quote, ...snapshot.quote, quote_options: quote.quote_options?.map(option => option.id === snapshot.option.id ? { ...option, ...snapshot.option } : option) };
}
