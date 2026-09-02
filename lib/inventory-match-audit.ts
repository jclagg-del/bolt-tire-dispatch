import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type SupplierProduct = {
  id: string; supplier?: string; brand: string; model: string; size: string; loadSpeed?: string;
  atdProductNumber?: string; manufacturerProductNumber?: string; cost?: number;
};

const normalize = (value?: string) => (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export async function auditSupplierMatches(products: SupplierProduct[]) {
  const atd = products.filter((product) => product.supplier === "ATD");
  const usaf = products.filter((product) => product.supplier === "USAF");
  if (!usaf.length) return;
  const now = new Date().toISOString();
  const records = usaf.map((product) => {
    const ids = new Set([product.atdProductNumber, product.manufacturerProductNumber].map(normalize).filter(Boolean));
    let match = atd.find((candidate) => [candidate.atdProductNumber, candidate.manufacturerProductNumber].map(normalize).some((id) => ids.has(id)));
    let confidence = match ? 100 : 0;
    let reason = match ? "Supplier or manufacturer product number matched" : "No corresponding ATD product found";
    if (!match) {
      match = atd.find((candidate) => normalize(candidate.brand) === normalize(product.brand) && normalize(candidate.model) === normalize(product.model) && normalize(candidate.size) === normalize(product.size));
      if (match) { confidence = 90; reason = "Brand, model, and size matched"; }
    }
    if (match && normalize(match.loadSpeed) && normalize(product.loadSpeed) && normalize(match.loadSpeed) !== normalize(product.loadSpeed)) {
      confidence = 65; reason = "Possible match has conflicting load or speed information";
    }
    return {
      canonical_key: `${normalize(product.size)}:${normalize(product.atdProductNumber || product.id)}`,
      tire_size: product.size, brand: product.brand, model: product.model,
      status: confidence >= 90 ? "matched" : "review", confidence, reason,
      supplier_offers: [product, ...(match ? [match] : [])].map((offer) => ({ supplier: offer.supplier, productNumber: offer.atdProductNumber, manufacturerNumber: offer.manufacturerProductNumber, cost: offer.cost })),
      last_seen_at: now,
    };
  });
  const { error } = await createAdminClient().from("inventory_match_audits").upsert(records, { onConflict: "canonical_key" });
  if (error && error.code !== "42P01") console.error("Inventory match audit failed", error.message);
}
