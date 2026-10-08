/**
 * Payment-method pricing foundation. Not enabled in live checkout yet.
 *
 * Stored quote prices remain the ACH/debit prices. The regular price is 103%
 * of that base, and the discount is the exact cent difference (not "3% off").
 * The eventual checkout must retrieve the ConfirmationToken from Stripe on
 * the SERVER and bind that same token to confirmation. Never accept a funding
 * type or amount supplied by the customer as proof of discount eligibility.
 *
 * Tax and legally fixed fees need their own treatment in the payment builder;
 * this helper operates on the already-defined price basis, not tax rules.
 */
export type StripeFundingPreview = {
  type?: string | null;
  card?: { funding?: string | null } | null;
};

export type VerifiedPaymentPricing = "regular" | "discounted";

export function paymentPricePair(baseCents: number) {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0 || baseCents > 99_999_999)
    throw new Error("Payment price must be a valid non-negative cent amount.");
  // Integer arithmetic rounds half a cent up, without float multiplication.
  const differenceCents = Math.floor((baseCents * 3 + 50) / 100);
  const regularCents = baseCents + differenceCents;
  if (regularCents > 99_999_999) throw new Error("Payment price exceeds the supported amount.");
  return { regularCents, discountedCents: baseCents, differenceCents };
}

/** Only call with a payment_method_preview retrieved directly from Stripe. */
export function verifiedPaymentPricing(preview: StripeFundingPreview): VerifiedPaymentPricing {
  if (preview.type === "us_bank_account") return "discounted";
  if (preview.type === "card") {
    if (preview.card?.funding === "credit") return "regular";
    if (preview.card?.funding === "debit" || preview.card?.funding === "prepaid") return "discounted";
    // Never charge the credit-card amount to an unidentified debit/prepaid card.
    throw new Error("Stripe could not verify this card type. Choose another card or ACH.");
  }
  throw new Error("This payment method is not supported by the payment-method discount checkout.");
}

export function verifiedPaymentAmount(baseCents: number, preview: StripeFundingPreview) {
  const prices = paymentPricePair(baseCents);
  const pricing = verifiedPaymentPricing(preview);
  return {
    ...prices,
    pricing,
    amountCents: pricing === "discounted" ? prices.discountedCents : prices.regularCents,
    discountCents: pricing === "discounted" ? prices.differenceCents : 0,
  };
}
