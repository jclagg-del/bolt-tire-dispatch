type ShopPrice = {
  installedPrice: number;
  estimatedTotals?: Record<string, number>;
  quotePrice: number;
  cost?: number;
};

export type PricingAudience = "staff" | "customer";

// MAP is the customer's tire price, not a floor under an additional markup.
// A missing/invalid MAP retains the configured markup-based fallback.
export function customerMapPrice(map: unknown, fallback: number): number {
  const value = Number(map);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : fallback;
}

// Use the same quantity-specific estimate for display, sorting and filtering.
export function installedTotal(tire: ShopPrice, quantity: number): number {
  return Number(tire.estimatedTotals?.[String(quantity)] ?? tire.installedPrice * quantity);
}

export function tireGrossProfit(tire: ShopPrice): number {
  return tire.quotePrice - (tire.cost || 0);
}

export function supplierCostLabel(cost?: number | null): string {
  return typeof cost === "number" && Number.isFinite(cost) && cost > 0
    ? `Cost $${cost.toFixed(2)} / tire`
    : "Cost unavailable";
}

export function markupPricing(cost: number, markupPercent: number, minimumProfit: number, category: "passenger" | "truck") {
  return {
    suggestedPrice: Number.isFinite(cost) && cost > 0 ? Math.ceil(cost + Math.max(cost * markupPercent / 100, minimumProfit)) : null,
    pricingMarkupPercent: markupPercent,
    pricingMinimumProfit: minimumProfit,
    pricingCategory: category,
  };
}
