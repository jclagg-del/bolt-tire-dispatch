type SupplierProduct = {
  id: string;
  supplier?: string;
  brand: string;
  model: string;
  size: string;
  loadSpeed: string;
  loadRange: string;
  atdProductNumber: string;
  manufacturerProductNumber: string;
  tireLibraryId?: number;
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const identifiers = (tire: SupplierProduct) => [tire.atdProductNumber, tire.manufacturerProductNumber].map(normalize).filter(Boolean);
const lightTruck = (tire: SupplierProduct) => /^lt/i.test(tire.size.trim())
  || /^(?:load\s*)?[c-h]$/i.test(tire.loadRange.trim())
  || /\d+\s*\/\s*\d+/.test(tire.loadSpeed);

// A model name (or model-level library entry) is not enough to compare prices:
// the same size can have different passenger/LT and load/speed variants.
export function supplierOffers<T extends SupplierProduct>(tire: T, products: T[]): T[] {
  const ids = new Set(identifiers(tire));
  const ranked = new Map<string, { product: T; rank: number }>();
  for (const candidate of products) {
    if (normalize(candidate.brand) !== normalize(tire.brand)) continue;
    const supplier = candidate.supplier || "ATD";
    const exact = identifiers(candidate).some(id => ids.has(id));
    const sameSpecs = normalize(candidate.model) === normalize(tire.model)
      && candidate.size.replace(/\D/g, "") === tire.size.replace(/\D/g, "")
      && lightTruck(candidate) === lightTruck(tire)
      && Boolean(tire.loadSpeed && candidate.loadSpeed)
      && normalize(candidate.loadSpeed) === normalize(tire.loadSpeed)
      && (!tire.loadRange || !candidate.loadRange || normalize(candidate.loadRange) === normalize(tire.loadRange));
    const rank = candidate.id === tire.id ? 3 : exact ? 2 : sameSpecs ? 1 : 0;
    if (!rank) continue;
    // Always use the current card for its own supplier; prefer exact part numbers
    // over specification fallbacks for other suppliers.
    if (!ranked.has(supplier) || rank > ranked.get(supplier)!.rank) ranked.set(supplier, { product: candidate, rank });
  }
  return [...ranked.values()].map(item => item.product).sort((a,b) => (a.supplier === "ATD" ? -1 : b.supplier === "ATD" ? 1 : 0));
}
