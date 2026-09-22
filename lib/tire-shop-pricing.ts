type ShopPrice = {
  installedPrice: number;
  estimatedTotals?: Record<string, number>;
  quotePrice: number;
  cost?: number;
};

// Use the same quantity-specific estimate for display, sorting and filtering.
export function installedTotal(tire: ShopPrice, quantity: number): number {
  return Number(tire.estimatedTotals?.[String(quantity)] ?? tire.installedPrice * quantity);
}

export function tireGrossProfit(tire: ShopPrice): number {
  return tire.quotePrice - (tire.cost || 0);
}
