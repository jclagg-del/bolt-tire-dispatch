export type DiscountCode = {
  id: string;
  code: string;
  description: string;
  percent: number;
  discount_type?: "percent" | "fixed";
  fixed_amount?: number;
  organization: string | null;
  tax_exempt: boolean;
  exemption_reference: string | null;
  active: boolean;
  expires_on: string | null;
};

export type AppliedDiscount = Pick<DiscountCode, "code" | "percent" | "discount_type" | "fixed_amount" | "organization" | "tax_exempt">;
type TireDiscount = Pick<DiscountCode, "percent" | "discount_type" | "fixed_amount">;

export function discountLabel(discount: TireDiscount): string {
  return discount.discount_type === "fixed" ? `$${Number(discount.fixed_amount || 0).toFixed(2)} off each tire` : `${Number(discount.percent)}% off tires`;
}

export function normalizeDiscountCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function discountCodeError(value: Partial<DiscountCode>): string | null {
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(normalizeDiscountCode(value.code))) return "Use 3–40 letters, numbers, hyphens or underscores for the code.";
  if (!Number.isFinite(Number(value.percent)) || Number(value.percent) < 0 || Number(value.percent) > 100) return "Enter a tire discount between 0% and 100%.";
  if (value.discount_type != null && !["percent", "fixed"].includes(value.discount_type)) return "Choose percentage or fixed dollars per tire.";
  const amount = Number(value.fixed_amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return "Enter a dollar discount from $0 to $999,999.99 with at most two decimal places.";
  if (value.discount_type === "fixed" && value.fixed_amount == null) return "Enter a dollar discount per tire.";
  if (value.tax_exempt && (!value.organization?.trim() || !value.exemption_reference?.trim())) return "Tax exemption requires an organization and your approved exemption record reference.";
  if (value.expires_on && (!/^\d{4}-\d{2}-\d{2}$/.test(value.expires_on) || !Number.isFinite(Date.parse(value.expires_on)) || new Date(value.expires_on).toISOString().slice(0, 10) !== value.expires_on)) return "Enter a valid expiration date.";
  return null;
}

export function discountIsAvailable(code: DiscountCode, today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })): boolean {
  return code.active && !discountCodeError(code) && (!code.expires_on || code.expires_on >= today);
}

// Round each tire to cents so checkout, payment, quotes and jobs agree exactly.
// Installation, disposal and state fees are never discounted.
export function discountedTirePrice(price: number, discount: number | TireDiscount | null): number {
  const percent = typeof discount === "number" ? discount : Number(discount?.percent || 0);
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("Invalid discount calculation");
  if (discount && typeof discount === "object") {
    if (discount.discount_type != null && !["percent", "fixed"].includes(discount.discount_type)) throw new Error("Invalid discount calculation");
    if (discount.discount_type === "fixed") {
      const amount = Number(discount.fixed_amount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) throw new Error("Invalid discount calculation");
      return Math.max(0, Math.round(price * 100) - Math.round(amount * 100)) / 100;
    }
  }
  return Math.round(Math.round(price * 100) * (1 - percent / 100)) / 100;
}
