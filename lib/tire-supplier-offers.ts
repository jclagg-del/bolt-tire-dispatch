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
  || /LT(?:\/\d+(?:PR)?)?$/i.test(tire.size.trim())
  || /^(?:load\s*)?[c-h]$/i.test(tire.loadRange.trim())
  || /\d+\s*\/\s*\d+/.test(tire.loadSpeed)
  || plyRatings(tire).some(ply => Number(ply) >= 6);

// USAF may supply "10 ply" in the load/speed field, not a service rating.
// Compare that against the other supplier's size suffix or load range instead.
const rangePly: Record<string, string> = { C: "6", D: "8", E: "10", F: "12", G: "14", H: "16" };
function loadSpecs(tire: SupplierProduct) {
  const metadata = tire.loadSpeed.trim().match(/^(?:Load\s+([C-H])(?:\s*·\s*)?)?(?:(\d{1,2})\s*(?:ply|PR))?$/i);
  return { speed: metadata ? "" : tire.loadSpeed, range: tire.loadRange || metadata?.[1] || "", ply: metadata?.[2] };
}
function plyRatings(tire: SupplierProduct): string[] {
  const specs = loadSpecs(tire);
  return [tireSizeIdentity(tire.size).ply, specs.ply, rangePly[specs.range.toUpperCase().replace(/^LOAD\s*/, "")]].filter((value): value is string => Boolean(value));
}

// Supplier metric sizes may append ply rating: LT285/60R20/10. The /10
// is not part of the rim diameter. Parse only known formats; unfamiliar
// annotations stay intact so they cannot silently collapse distinct variants.
export function tireSizeIdentity(value: string): { dimensions: string; ply: string | null } {
  const text = value.toUpperCase().replace(/\s/g, "");
  const flotation = text.match(/^(?:LT)?(\d{2}(?:\.\d)?)X(\d{1,2}\.\d{1,2}|\d{3,4})R(\d{2}(?:\.5)?)(?:LT)?(?:\/(\d{1,2})(?:PR)?)?$/);
  // Only known flotation dimensions; don't reinterpret compact metric/truck sizes.
  const compactFlotation = text.match(/^([2-5]\d)(0[5-9]\d{2}|1\d{3})(1\d|2\d)$/);
  if (flotation || compactFlotation) {
    const parts = (flotation || compactFlotation)!;
    const width = parts[2].includes(".") ? Number(parts[2]) : Number(parts[2]) / 100;
    return { dimensions: `${Number(parts[1])}X${width.toFixed(2)}R${parts[3]}`, ply: flotation?.[4] || null };
  }
  // Commercial supplier shorthand omits the decimal too: 22570195 means
  // 225/70R19.5. Accept only compact metric sizes and known half-inch rims;
  // do not reinterpret malformed formatted sizes such as 225/70R195.
  const compactHalfInch = text.match(/^(?:LT|P|ST|T)?([1-4]\d{2})(\d{2})(165|175|195|225|245)(?:LT|XL|SL)?(?:\/(\d{1,2})(?:PR)?)?$/);
  if (compactHalfInch) return { dimensions: `${compactHalfInch[1]}/${compactHalfInch[2]}R${Number(compactHalfInch[3]) / 10}`, ply: compactHalfInch[4] || null };
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
  if (new Set([...plyRatings(a), ...plyRatings(b)]).size > 1) return false;
  const specsA = loadSpecs(a), specsB = loadSpecs(b);
  for (const field of ["loadSpeed", "loadRange", "sidewall", "oeMarking"] as const) {
    const spec = (value: string) => field === "loadSpeed" ? value.toLowerCase().replace(/\s/g, "") : field === "sidewall" ? normalizeTireSidewall(value) : normalize(value);
    const valueA = field === "loadSpeed" ? specsA.speed : field === "loadRange" ? specsA.range : a[field];
    const valueB = field === "loadSpeed" ? specsB.speed : field === "loadRange" ? specsB.range : b[field];
    if (valueA && valueB && spec(valueA) !== spec(valueB)) return false;
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
