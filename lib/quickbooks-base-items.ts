type CatalogItem = { Id: string; Name: string; FullyQualifiedName?: string; Type?: string };
/** Match existing catalog names; never invent an account or substitute an
 * unrelated service. Quoted service category disambiguates installation. */
export function quickBooksBaseItems(items: CatalogItem[], category: string | null, quantity: number) {
  const normalize = (value = "") => value.trim().toLowerCase();
  const find = (...names: string[]) => items.find(item => ["Service", "NonInventory", "Inventory"].includes(item.Type || "") && names.some(name => normalize(item.Name) === normalize(name) || normalize(item.FullyQualifiedName) === normalize(name)));
  const tier = quantity > 0 && quantity <= 2 ? "1 - 2" : quantity <= 4 ? "3 - 4" : "";
  const installationName = category === "passenger" && tier ? `On-Site Mount & Balance - Passenger Vehicle (${tier} Tires)`
    : category === "truck" && tier ? `On-Site Mount & Balance - Light/Medium Truck (${tier} Tires)`
    : category === "trailer_atv" && quantity >= 3 && quantity <= 4 ? "On-Site Mount & Dismount - Trailer (3 - 4 Tires)" : "";
  return {
    tireItem: find("Tires"),
    installationItem: (installationName ? find(installationName) : undefined) || find("On-site Mount and Balance"),
    installationName: installationName || "On-site Mount and Balance",
    stateTireFeeItem: find("NY State Tire Tax", "NYS Tire Disposal Fee"),
    disposalItem: find("Waste Tire Fee"),
  };
}
