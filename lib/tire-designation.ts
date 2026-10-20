type TireDesignation = {
  size: string;
  loadRange?: string | null;
  loadSpeed?: string | null;
  category?: string | null;
};

function sizeParts(size: string) {
  const text = size.toUpperCase().replace(/\s/g, "");
  const metric = text.match(/^(LT|P|ST|T)?(\d{3})\/?(\d{2})(?:ZR|R)?(\d{2}(?:\.5)?)(LT|XL|SL|CP|C)?(?:\/(\d{1,2})(?:PR)?)?$/);
  const flotation = text.match(/^(LT)?(\d{2}(?:\.\d)?)X(\d{1,2}\.\d{1,2}|\d{3,4})R(\d{2})(LT)?(?:\/(\d{1,2})(?:PR)?)?$/);
  if (metric) return { prefix: metric[1], suffix: metric[5], ply: metric[6], dimensions: `${metric[2]}/${metric[3]}R${metric[4]}`, rim: Number(metric[4]) };
  if (flotation) return { prefix: flotation[1], suffix: flotation[5], ply: flotation[6], dimensions: `${Number(flotation[2])}X${(flotation[3].includes(".") ? Number(flotation[3]) : Number(flotation[3]) / 100).toFixed(2)}R${flotation[4]}`, rim: Number(flotation[4]) };
  return null;
}

// LT construction is separate from terrain, SUV fitment and pricing category.
// Supplier compact sizes can omit LT; use SKU load specs, never XL or price/FET.
export function tireIsLightTruck(tire: TireDesignation): boolean {
  const size = sizeParts(tire.size);
  if (!size) return false;
  const range = String(tire.loadRange || "").trim().toUpperCase().replace(/^LOAD\s*(?:RANGE\s*)?/, "");
  if (["P", "ST", "T"].includes(size.prefix || "") || ["XL", "SL", "C", "CP"].includes(size.suffix || "") ||
    ["XL", "SL", "EXTRA LOAD", "STANDARD LOAD"].includes(range)) return false;
  if (size.prefix === "LT" || size.suffix === "LT") return true;
  // Do not reinterpret commercial van, trailer or medium/heavy-truck ratings as LT.
  if (/trailer|medium|heavy|commercial|van/i.test(tire.category || "") || size.rim > 24 || size.rim % 1 !== 0) return false;
  const specs = String(tire.loadSpeed || "").trim();
  return /^[C-H]$/.test(range) || /^(?:Load\s+(?:Range\s+)?[C-H])\b/i.test(specs) ||
    /^\d{3}\s*\/\s*\d{3}(?:\s*[A-Z](?:\s+[C-H])?)?$/i.test(specs) ||
    /^(6|8|10|12|14|16)\s*(?:ply|PR)$/i.test(specs) || /^(6|8|10|12|14|16)$/.test(size.ply || "");
}

export function tireDisplaySize(tire: TireDesignation): string {
  if (!tireIsLightTruck(tire)) return tire.size;
  return `LT${sizeParts(tire.size)!.dimensions}`;
}
