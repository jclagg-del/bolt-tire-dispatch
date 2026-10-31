// Catalog APIs are not type-safe at runtime: "false" and "0" are truthy in JS.
// Preserve unknown separately so it can fall back to another exact-SKU source.
export function catalogFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return undefined;
}

type Classification = { terrain?: string | null; season?: string | null; category?: string | null };
const clean = (value?: string | null) => {
  const text = typeof value === "string" ? value.trim() : "";
  return /^(undefined|unknown|n\/a|none|null|-)$/i.test(text) ? "" : text;
};

export function catalogCategory(exact: Classification | null | undefined): string {
  if (!exact) return "";
  const season = clean(exact.season);
  // A broad terrain field must not obscure an explicit seasonal restriction.
  if (/\b(summer|winter)\b/i.test(season)) return season;
  return clean(exact.terrain) || season || clean(exact.category);
}

type BadgeTire = {
  brand: string; model: string; size: string;
  manufacturerProductNumber?: string; atdProductNumber?: string;
  category?: string; snowRated?: boolean; runFlat?: boolean;
};

export function normalizeTireBadges<T extends BadgeTire>(tire: T): T {
  let category = clean(tire.category);
  let snowRated = catalogFlag(tire.snowRated) === true;
  const runFlat = catalogFlag(tire.runFlat) === true;
  // Verified manufacturer correction, deliberately scoped to this part/size.
  // Do not apply it to the entire Scorpion family or other OE variants.
  // Use the US-market specification (international seasonal labels differ).
  // https://www.pirelli.com/tires/en-us/car/catalog/product/scorpion-zero-asimmetrico/295_40-r22
  const part = (tire.manufacturerProductNumber || tire.atdProductNumber || "").trim();
  if (/^pirelli(?:\s+tires)?$/i.test(tire.brand.trim()) && part === "3136900" &&
      /scorpion.*zero.*asimmetrico/i.test(tire.model) && tire.size.replace(/\D/g, "") === "2954022") {
    category = "Performance All-Season";
    snowRated = false;
  }
  // Summer and severe-snow certification are contradictory; never advertise
  // snow certification when the supplied classification explicitly says summer.
  if (/\bsummer\b/i.test(category)) snowRated = false;
  return { ...tire, category, snowRated, runFlat };
}
