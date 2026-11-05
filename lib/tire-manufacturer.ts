// Explicit tire-brand aliases only. Never infer a manufacturer from a model,
// size, substring or supplier part number; unfamiliar names remain unchanged.
export function tireManufacturerName(value: string | null | undefined): string {
  const name = (value || "").trim();
  const key = name.toUpperCase().replace(/[.\s-]/g, "");
  return ["BK", "BKT", "BKTTIRES", "BKTTYRES"].includes(key) ? "BKT" : name;
}
