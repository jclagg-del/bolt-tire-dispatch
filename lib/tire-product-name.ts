// Supplier catalog sizing labels are not part of this tread pattern's name.
// Scope this alias to Toyo Open Country M/T, independent of size or supplier;
// never strip "flotation" from unrelated agricultural/product names.
export function normalizeTireProductName<T extends { brand: string; model: string }>(tire: T): T {
  const brand = tire.brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  const model = tire.model.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["toyo", "toyotires"].includes(brand) &&
      /^(?:toyo(?:tires)?)?opencountrymt(?:flotation)?$/.test(model)) {
    return { ...tire, model: "Open Country M/T" };
  }
  return tire;
}
