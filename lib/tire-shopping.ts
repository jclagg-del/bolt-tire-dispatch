export type TireProduct = {
  id: string;
  brand: string;
  model: string;
  size: string;
  category: string;
  loadSpeed: string;
  warranty: number;
  cost: number;
  installedPrice: number;
  availability: { local: number; localPlus: number; nationwide: number };
  delivery: string;
  snowRated: boolean;
  runFlat: boolean;
  atdProductNumber: string;
};

export const betaTires: TireProduct[] = [
  { id: "1", brand: "Goodyear", model: "Assurance All-Season", size: "275/65R18", category: "All-Season", loadSpeed: "116T", warranty: 65000, cost: 182, installedPrice: 319, availability: { local: 8, localPlus: 24, nationwide: 99 }, delivery: "Available today", snowRated: false, runFlat: false, atdProductNumber: "ATD-100281" },
  { id: "2", brand: "Cooper", model: "Discoverer Road+Trail AT", size: "275/65R18", category: "All-Terrain", loadSpeed: "116T", warranty: 65000, cost: 194, installedPrice: 339, availability: { local: 4, localPlus: 18, nationwide: 72 }, delivery: "Available today", snowRated: true, runFlat: false, atdProductNumber: "ATD-100282" },
  { id: "3", brand: "Falken", model: "Wildpeak A/T4W", size: "275/65R18", category: "All-Terrain", loadSpeed: "116T", warranty: 65000, cost: 218, installedPrice: 369, availability: { local: 0, localPlus: 12, nationwide: 55 }, delivery: "Usually 1–2 days", snowRated: true, runFlat: false, atdProductNumber: "ATD-100283" },
  { id: "4", brand: "Goodyear", model: "Wrangler Workhorse HT", size: "LT245/75R17", category: "Highway", loadSpeed: "121/118R E", warranty: 60000, cost: 201, installedPrice: 349, availability: { local: 6, localPlus: 16, nationwide: 81 }, delivery: "Available today", snowRated: false, runFlat: false, atdProductNumber: "ATD-100284" },
  { id: "5", brand: "General", model: "Grabber HTS60", size: "245/75R17", category: "Highway", loadSpeed: "110T", warranty: 65000, cost: 158, installedPrice: 289, availability: { local: 2, localPlus: 10, nationwide: 46 }, delivery: "Available today", snowRated: false, runFlat: false, atdProductNumber: "ATD-100285" },
];

export function normalizeTireSize(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function matchesTireSize(productSize: string, query: string) {
  const normalizedQuery = normalizeTireSize(query);
  if (!normalizedQuery) return true;
  const normalizedProduct = normalizeTireSize(productSize);
  if (/^[0-9]+$/.test(normalizedQuery)) {
    return normalizedProduct.replace(/[^0-9]/g, "").includes(normalizedQuery);
  }
  return normalizedProduct.includes(normalizedQuery);
}
