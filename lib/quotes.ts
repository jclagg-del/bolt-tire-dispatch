export type QuoteStatus = "draft" | "sent" | "viewed" | "approved" | "declined" | "expired" | "converted";
export type QuoteTier = "good" | "better" | "best";

export type QuoteOption = {
  id?: string;
  quote_id?: string;
  tier: QuoteTier;
  brand: string;
  model: string;
  image_url: string;
  price_per_tire: string;
  warranty_miles: string;
  tire_type: string;
  load_speed_rating: string;
  snow_rating: string;
  highlights: string;
  availability: string;
  supplier?: string;
  supplier_product_id?: string;
  manufacturer_product_id?: string;
  wholesale_cost?: number | string | null;
  supplier_availability?: { local?: number; localPlus?: number; nationwide?: number } | null;
  recommended: boolean;
  sort_order: number;
};

export const emptyQuoteOptions: QuoteOption[] = [
  { tier: "good", brand: "", model: "", image_url: "", price_per_tire: "", warranty_miles: "", tire_type: "", load_speed_rating: "", snow_rating: "", highlights: "", availability: "", recommended: false, sort_order: 1 },
  { tier: "better", brand: "", model: "", image_url: "", price_per_tire: "", warranty_miles: "", tire_type: "", load_speed_rating: "", snow_rating: "", highlights: "", availability: "", recommended: true, sort_order: 2 },
  { tier: "best", brand: "", model: "", image_url: "", price_per_tire: "", warranty_miles: "", tire_type: "", load_speed_rating: "", snow_rating: "", highlights: "", availability: "", recommended: false, sort_order: 3 },
];

export function quoteOptionTotal(option: Pick<QuoteOption, "price_per_tire">, quantity: number, fees: { installation: number; serviceCall: number; disposal: number; stateFee: number; taxRate: number; taxExempt: boolean }) {
  const tires = (Number(option.price_per_tire) || 0) * quantity;
  const taxable = tires + fees.installation + fees.serviceCall + fees.disposal;
  const tax = fees.taxExempt ? 0 : taxable * (fees.taxRate / 100);
  return taxable + fees.stateFee + tax;
}
