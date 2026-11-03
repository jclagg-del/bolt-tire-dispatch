import { tireSizeIdentity } from "./tire-supplier-offers";

// Tire Library's OD sizes use overall diameter as width and NO aspect ratio.
// https://app.tireweblibrary.com/Docs/Tires
export function tireLibrarySizeQuery(size: string): string | null {
  const dimensions = tireSizeIdentity(size).dimensions;
  const od = dimensions.match(/^(\d{2}(?:\.\d+)?)X(\d+(?:\.\d+)?)R(\d{2}(?:\.5)?)$/);
  if (od) return new URLSearchParams({ width: od[1], rim_size: od[3], size_format: "OD" }).toString();
  const metric = dimensions.match(/^(\d{3})\/(\d{2})R(\d{2}(?:\.5)?)$/);
  if (metric) return new URLSearchParams({ width: metric[1], aspect_ratio: metric[2], rim_size: metric[3] }).toString();
  return null; // Never invent dimensions by deleting punctuation or ply suffixes.
}
