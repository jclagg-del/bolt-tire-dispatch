export function brandKey(brand: string): string {
  return brand.trim().toUpperCase();
}

export function tireBrands(products: { brand: string }[]): string[] {
  return [...new Set(products.map((product) => brandKey(product.brand)).filter(Boolean))].sort();
}

export function matchesBrands(brand: string, selectedBrands: string[]): boolean {
  return selectedBrands.length === 0 || selectedBrands.includes(brandKey(brand));
}
