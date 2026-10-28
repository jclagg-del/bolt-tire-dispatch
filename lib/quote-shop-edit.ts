import { emptyQuoteOptions, quoteOptionsForEditor, type QuoteOption } from "@/lib/quotes";
import { tireSizeIdentity } from "@/lib/tire-supplier-offers";
import { quoteOptionSize } from "@/lib/quote-tire-size";

export const quoteShopKey = (id: string) => `bolt-edit-quote-shop-v1:${id}`;
export function quoteHasSplitFitment(quote: { rear_tire_size?: string | null }, options: Array<Partial<QuoteOption>>) {
  return Boolean(quote.rear_tire_size?.trim() || options.some(o => o.rear_brand?.trim() || o.rear_model?.trim()));
}
export function canEditQuoteTires(quote: { payment_status?: string | null; converted_job_id?: string | null; status?: string | null }) {
  return !quote.converted_job_id && quote.status !== "converted" && !["pending", "paid", "refunded"].includes(quote.payment_status || "");
}
export type QuoteShopProduct = {
  id: string; brand: string; model: string; size: string; imageUrl: string | null; quotePrice: number;
  warranty: string; category: string; loadSpeed: string; loadRange: string; snowRated: boolean;
  supplier?: string; atdProductNumber: string; manufacturerProductNumber: string; cost?: number;
  fitmentPosition: "front" | "rear" | "both";
  availability: { local: number; localPlus: number; nationwide: number };
  quoteOptionKey?: string; quoteSnapshot?: boolean;
};
export type QuoteShopDraft<F = Record<string, unknown>> = {
  quoteId: string; version: string; form: F; options: QuoteOption[]; splitFitment: boolean;
  products: QuoteShopProduct[]; result?: QuoteShopProduct[];
};

// Saved quote options do not contain every catalog attribute (for example load range).
// Match them only by an exact part identity and size, never just brand/model.
export function matchesQuoteSnapshot(saved: QuoteShopProduct, product: QuoteShopProduct) {
  if (!saved.quoteSnapshot || tireSizeIdentity(saved.size).dimensions !== tireSizeIdentity(product.size).dimensions) return false;
  const manufacturerMatch = saved.manufacturerProductNumber && saved.manufacturerProductNumber === product.manufacturerProductNumber;
  const supplierMatch = saved.supplier && saved.supplier === product.supplier && saved.atdProductNumber && saved.atdProductNumber === product.atdProductNumber;
  return Boolean(manufacturerMatch || supplierMatch);
}

export function quoteShopProducts(options: QuoteOption[], form: { tire_size: string; rear_tire_size: string }, split: boolean): QuoteShopProduct[] {
  return options.filter(o => o.brand.trim() && o.model.trim()).slice(0, split ? 1 : 3).flatMap(o => {
    const make = (rear: boolean): QuoteShopProduct => ({
      id: `quote-${o.id || o.tier}-${rear ? "rear" : "front"}`, quoteOptionKey: o.id || o.tier, quoteSnapshot: true,
      brand: rear ? o.rear_brand || "" : o.brand, model: rear ? o.rear_model || "" : o.model,
      size: rear ? form.rear_tire_size : quoteOptionSize(form, o),
      imageUrl: (rear ? o.rear_image_url : o.image_url) || null,
      quotePrice: Number(rear ? o.rear_price_per_tire : o.price_per_tire) || 0,
      warranty: rear ? "" : String(o.warranty_miles || ""), category: rear ? "" : o.tire_type,
      loadSpeed: rear ? "" : o.load_speed_rating, loadRange: "", snowRated: !rear && o.snow_rating === "3PMSF",
      supplier: rear ? o.rear_supplier : o.supplier,
      atdProductNumber: (rear ? o.rear_supplier_product_id : o.supplier_product_id) || "",
      manufacturerProductNumber: (rear ? o.rear_manufacturer_product_id : o.manufacturer_product_id) || "",
      cost: (rear ? o.rear_wholesale_cost : o.wholesale_cost) == null ? undefined : Number(rear ? o.rear_wholesale_cost : o.wholesale_cost),
      fitmentPosition: split ? rear ? "rear" : "front" : "both",
      availability: { local: 0, localPlus: 0, nationwide: 0 },
    });
    return split ? [make(false), make(true)] : [make(false)];
  });
}

function applyProduct(base: QuoteOption, product: QuoteShopProduct): QuoteOption {
  if (product.quoteSnapshot) return { ...base, tire_size: product.size || base.tire_size, price_per_tire: String(product.quotePrice) };
  const stock = product.availability.local || product.availability.localPlus;
  return { ...base, tire_size: product.size, brand: product.brand, model: product.model, image_url: product.imageUrl || "", price_per_tire: String(product.quotePrice),
    warranty_miles: String(product.warranty || "").replace(/[^\d]/g, ""), tire_type: product.category || "",
    load_speed_rating: product.loadSpeed || "", snow_rating: product.snowRated ? "3PMSF" : "",
    availability: stock ? `In stock (${stock})` : "Special order", supplier: product.supplier,
    supplier_product_id: product.atdProductNumber, manufacturer_product_id: product.manufacturerProductNumber,
    wholesale_cost: product.cost, supplier_availability: product.availability };
}

// Explicit user choice only: turn the remaining tire into a single-size quote.
// Keep total quantity and custom fees; clear every rear field so it cannot be
// billed a second time by downstream quote/payment calculations.
export function singleSizeQuoteDraft<F extends { tire_size: string; rear_tire_size: string; quantity: string; rear_quantity: string }>(draft: QuoteShopDraft<F>, product: QuoteShopProduct): QuoteShopDraft<F> {
  if (!product.size || !product.brand || !product.model || !Number.isFinite(product.quotePrice) || product.quotePrice < 0) throw new Error("Choose a complete tire before switching to one size.");
  const quantities = [Number(draft.form.quantity), Number(draft.form.rear_quantity || 0)];
  const totalQuantity = quantities[0] + quantities[1];
  if (quantities.some(q => !Number.isInteger(q) || q < 0) || totalQuantity < 1) throw new Error("Enter valid tire quantities in the quote editor before switching to one size.");
  const original = draft.options.find(o => (o.id || o.tier) === product.quoteOptionKey) || draft.options.find(o => o.brand && o.model) || emptyQuoteOptions[0];
  const base = product.quoteSnapshot && product.fitmentPosition === "rear"
    ? { ...emptyQuoteOptions[0], id: original.id, tier: original.tier, quote_id: original.quote_id }
    : original;
  const option = { ...applyProduct(base, { ...product, quoteSnapshot: product.quoteSnapshot && product.fitmentPosition !== "rear" }),
    rear_brand: "", rear_model: "", rear_image_url: "", rear_price_per_tire: "", rear_supplier: "",
    rear_supplier_product_id: "", rear_manufacturer_product_id: "", rear_wholesale_cost: null, recommended: true, sort_order: 1 };
  const form = { ...draft.form, tire_size: product.size, quantity: String(totalQuantity), rear_tire_size: "", rear_quantity: "" };
  const options = quoteOptionsForEditor([option]).map(o => ({ ...o, recommended: Boolean(o.brand && o.model && o.recommended) }));
  const products = quoteShopProducts(options, form, false);
  return { ...draft, form, options, splitFitment: false, products, result: products };
}

export function applyQuoteShopSelection<F extends { tire_size: string; rear_tire_size: string }>(draft: QuoteShopDraft<F>, selected: QuoteShopProduct[]) {
  if (!selected.length || selected.length > 3) throw new Error("Choose one to three tire options.");
  if (selected.some(p => !p.brand || !p.model || !Number.isFinite(p.quotePrice) || p.quotePrice < 0)) throw new Error("Each tire needs a valid brand, model and price.");
  if (draft.splitFitment) {
    const front = selected.find(p => p.fitmentPosition === "front"), rear = selected.find(p => p.fitmentPosition === "rear");
    if (selected.length !== 2 || !front || !rear) throw new Error("Choose one front tire and one rear tire for this split-fitment quote.");
    const base = draft.options.find(o => o.brand && o.model) || emptyQuoteOptions[0];
    const option = { ...applyProduct(base, front), rear_brand: rear.brand, rear_model: rear.model,
      rear_image_url: rear.imageUrl || "", rear_price_per_tire: String(rear.quotePrice), rear_supplier: rear.supplier,
      rear_supplier_product_id: rear.atdProductNumber, rear_manufacturer_product_id: rear.manufacturerProductNumber, rear_wholesale_cost: rear.cost };
    return { form: { ...draft.form, tire_size: front.size || draft.form.tire_size, rear_tire_size: rear.size || draft.form.rear_tire_size }, options: quoteOptionsForEditor([option]) };
  }
  // Retained options keep their database slot and custom notes. New choices use free slots.
  const originals = new Map(draft.options.map(o => [o.id || o.tier, o]));
  const retained = new Set(selected.map(p => originals.get(p.quoteOptionKey || "")?.tier).filter(Boolean));
  const used = new Set<string>();
  const options = selected.map((product, index) => {
    const previous = originals.get(product.quoteOptionKey || "");
    const base = previous && !used.has(previous.tier) ? previous : emptyQuoteOptions.find(o => !retained.has(o.tier) && !used.has(o.tier))!;
    if (!base) throw new Error("Too many tire choices. Remove an option first.");
    used.add(base.tier);
    return { ...applyProduct(base, product), sort_order: index + 1 };
  });
  const recommended = options.find(o => o.recommended && retained.has(o.tier)) || options[0];
  for (const option of options) option.recommended = option === recommended;
  return { form: { ...draft.form, tire_size: selected[0].size || draft.form.tire_size }, options: quoteOptionsForEditor(options) };
}
