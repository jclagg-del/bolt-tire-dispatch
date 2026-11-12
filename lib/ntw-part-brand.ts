// Never infer the brand from a supplier SKU or a loosely matching description.
export function ntwPartBrand(query: string, products: { manufacturerProductNumber?: string; brand?: string }[]) {
  const key = query.trim().toUpperCase();
  const matches = products.filter(product => product.manufacturerProductNumber?.trim().toUpperCase() === key);
  const brands = new Map<string, string>();
  for (const product of matches) {
    const brand = product.brand?.trim();
    if (brand && !/^unknown(?: brand)?$/i.test(brand)) brands.set(brand.toUpperCase(), brand);
  }
  return brands.size === 1 ? [...brands.values()][0] : "";
}
