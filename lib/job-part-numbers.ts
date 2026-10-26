type PartOption = {
  supplier?: string | null; supplier_product_id?: string | null; manufacturer_product_id?: string | null;
  rear_supplier?: string | null; rear_supplier_product_id?: string | null; rear_manufacturer_product_id?: string | null;
};

export function quoteManufacturerParts(option: PartOption, rearQuantity = 0): string | null {
  // Older USAF quote snapshots put the UPC barcode in manufacturer_product_id.
  // Its catalogue part_number is the product's part number, not the UPC.
  const part = (supplier?: string | null, ordering?: string | null, manufacturer?: string | null) =>
    (/^(USAF|U\.?S\.?\s*AutoForce)$/i.test(supplier?.trim() || "") ? ordering?.trim() : manufacturer?.trim()) || "";
  const front = part(option.supplier, option.supplier_product_id, option.manufacturer_product_id);
  if (!(rearQuantity > 0)) return front || null;
  const rear = part(option.rear_supplier, option.rear_supplier_product_id, option.rear_manufacturer_product_id);
  if (!front && !rear) return null;
  return `Front: ${front || "Not recorded"} / Rear: ${rear || "Not recorded"}`;
}
