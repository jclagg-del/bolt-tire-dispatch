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
  sidewall?: string;
  oeMarking?: string;
  runFlat?: boolean;
  fitmentPosition?: string;
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
export function normalizeTireSidewall(value: string): string {
  const key = normalize(value);
  return ["bw", "bsw", "blk", "blackwall", "blacksidewall"].includes(key) ? "bsw" : key;
}
const identifiers = (tire: SupplierProduct) => [tire.atdProductNumber, tire.manufacturerProductNumber].map(normalize).filter(Boolean);
const lightTruck = (tire: SupplierProduct) => /^lt/i.test(tire.size.trim())
  || /^(?:load\s*)?[c-h]$/i.test(tire.loadRange.trim())
  || /\d+\s*\/\s*\d+/.test(tire.loadSpeed);

// Supplier metric sizes may append ply rating: LT285/60R20/10. The /10
// is not part of the rim diameter. Parse only known formats; unfamiliar
// annotations stay intact so they cannot silently collapse distinct variants.
export function tireSizeIdentity(value: string): { dimensions: string; ply: string | null } {
  const text = value.toUpperCase().replace(/\s/g, "");
  const metric = text.match(/^(?:LT|P|ST|T)?(\d{3})\/?(\d{2})(?:ZR|R)?(\d{2}(?:\.5)?)(?:LT|XL|SL)?(?:\/(\d{1,2})(?:PR)?)?$/);
  if (!metric) return { dimensions: text, ply: null };
  return { dimensions: `${metric[1]}/${metric[2]}R${metric[3]}`, ply: metric[4] || null };
}

// Exact identifiers are required; identical model/size/specs alone can still
// describe different OE, sidewall, or construction variants.
export function sameTireVariant(a: SupplierProduct, b: SupplierProduct): boolean {
  if (a.id === b.id && (a.fitmentPosition || "both") === (b.fitmentPosition || "both")) return true;
  const sizeA = tireSizeIdentity(a.size), sizeB = tireSizeIdentity(b.size);
  if (normalize(a.brand) !== normalize(b.brand) || !a.size || !b.size ||
      sizeA.dimensions !== sizeB.dimensions || lightTruck(a) !== lightTruck(b) ||
      (a.fitmentPosition || "both") !== (b.fitmentPosition || "both")) return false;
  if (sizeA.ply && sizeB.ply && sizeA.ply !== sizeB.ply) return false;
  for (const field of ["loadSpeed", "loadRange", "sidewall", "oeMarking"] as const) {
    const spec = (value: string) => field === "loadSpeed" ? value.toLowerCase().replace(/\s/g, "") : field === "sidewall" ? normalizeTireSidewall(value) : normalize(value);
    if (a[field] && b[field] && spec(a[field]!) !== spec(b[field]!)) return false;
  }
  if (typeof a.runFlat === "boolean" && typeof b.runFlat === "boolean" && a.runFlat !== b.runFlat) return false;
  const ids = new Set(identifiers(a));
  return identifiers(b).some(id => ids.has(id));
}

// Call after filtering/sorting: the first eligible offer remains the displayed
// price and purchasing target. Original offers stay available for supplier choice.
export function uniqueTireCards<T extends SupplierProduct>(products: T[]): T[] {
  const cards: T[] = [];
  for (const product of products) if (!cards.some(card => sameTireVariant(card, product))) cards.push(product);
  return cards;
}

// A model name (or model-level library entry) is not enough to compare prices:
// the same size can have different passenger/LT and load/speed variants.
export function supplierOffers<T extends SupplierProduct>(tire: T, products: T[]): T[] {
  const ranked = new Map<string, { product: T; rank: number }>();
  for (const candidate of products) {
    if (!sameTireVariant(tire, candidate)) continue;
    const supplier = candidate.supplier || "ATD";
    const rank = candidate.id === tire.id ? 3 : 2;
    // Always use the current card for its own supplier.
    if (!ranked.has(supplier) || rank > ranked.get(supplier)!.rank) ranked.set(supplier, { product: candidate, rank });
  }
  return [...ranked.values()].map(item => item.product).sort((a,b) => (a.supplier === "ATD" ? -1 : b.supplier === "ATD" ? 1 : 0));
}
