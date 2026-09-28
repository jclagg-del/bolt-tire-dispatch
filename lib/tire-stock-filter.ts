type StockedTire = { availability: { local: number; localPlus: number; nationwide: number } };

export function hasTireStock(tire: StockedTire): boolean {
  return Object.values(tire.availability).some(quantity => Number(quantity) > 0);
}

export function matchesTireStock(tire: StockedTire, nearbyOnly: boolean, showOutOfStock: boolean): boolean {
  if (showOutOfStock) return true;
  return nearbyOnly
    ? tire.availability.local + tire.availability.localPlus > 0
    : hasTireStock(tire);
}
