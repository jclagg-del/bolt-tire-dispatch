export type SavedRouteOrder = { vehicle_id: string; job_ids: string[]; revision: number };

export function routeDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(key => parts.find(p => p.type === key)?.value).join("-");
}

// Saved stops come first; newly scheduled jobs keep their existing time order.
export function applyRouteOrder<T extends { id: string | number }>(jobs: T[], ids: string[] = []): T[] {
  const rank = new Map(ids.map((id, index) => [String(id), index]));
  return [...jobs].sort((a, b) => (rank.get(String(a.id)) ?? ids.length) - (rank.get(String(b.id)) ?? ids.length));
}

export function moveRouteStop(ids: string[], source: string, target: string, after = false) {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids;
  const next = ids.filter(id => id !== source);
  next.splice(next.indexOf(target) + Number(after), 0, source);
  return next;
}

export function validRouteChange(value: unknown): value is { date: string; vehicleId: string; jobIds: string[]; revision: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)
    && typeof v.vehicleId === "string" && v.vehicleId.length > 0 && v.vehicleId.length <= 100
    && Number.isSafeInteger(v.revision) && Number(v.revision) >= 0
    && Array.isArray(v.jobIds) && v.jobIds.length > 0 && v.jobIds.length <= 500
    && v.jobIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 100)
    && new Set(v.jobIds).size === v.jobIds.length;
}
