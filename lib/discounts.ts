export type DiscountCode = {
  id: string;
  code: string;
  description: string;
  percent: number;
  organization: string | null;
  tax_exempt: boolean;
  exemption_reference: string | null;
  active: boolean;
  expires_on: string | null;
};

export type AppliedDiscount = Pick<DiscountCode, "code" | "percent" | "organization" | "tax_exempt">;

export function normalizeDiscountCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function discountCodeError(value: Partial<DiscountCode>): string | null {
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(normalizeDiscountCode(value.code))) return "Use 3–40 letters, numbers, hyphens or underscores for the code.";
  if (!Number.isFinite(Number(value.percent)) || Number(value.percent) < 0 || Number(value.percent) > 100) return "Enter a tire discount between 0% and 100%.";
  if (value.tax_exempt && (!value.organization?.trim() || !value.exemption_reference?.trim())) return "Tax exemption requires an organization and your approved exemption record reference.";
  if (value.expires_on && (!/^\d{4}-\d{2}-\d{2}$/.test(value.expires_on) || !Number.isFinite(Date.parse(value.expires_on)) || new Date(value.expires_on).toISOString().slice(0, 10) !== value.expires_on)) return "Enter a valid expiration date.";
  return null;
}

export function discountIsAvailable(code: DiscountCode, today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })): boolean {
  return code.active && !discountCodeError(code) && (!code.expires_on || code.expires_on >= today);
}

// Round each tire to cents so checkout, payment, quotes and jobs agree exactly.
// Installation, disposal and state fees are never discounted.
export function discountedTirePrice(price: number, percent: number): number {
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("Invalid discount calculation");
  return Math.round(Math.round(price * 100) * (1 - percent / 100)) / 100;
}
