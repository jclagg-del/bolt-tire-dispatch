export type SavedRouteOrder = { vehicle_id: string; job_ids: string[]; revision: number };

// Jobs store New York wall-clock timestamps, not UTC instants.
export function validRouteDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(value)) return false;
  const date = new Date(value.slice(0, 19) + (value.length === 16 ? ":00Z" : "Z"));
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value.slice(0, 16)
    && Number(value.slice(17, 19) || 0) < 60;
}

export function routeDateTimeInput(value?: string | null) {
  if (!value) return "";
  const normalized = value.trim().replace(" ", "T");
  if (validRouteDateTime(normalized)) return normalized.slice(0, 16);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) return "";
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function routeDate(value: string | Date) {
  if (typeof value === "string") return routeDateTimeInput(value).slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(key => parts.find(p => p.type === key)?.value).join("-");
}

export type RouteAppointment = { jobId: string; expectedScheduled: string; scheduled: string };
export function validRouteAppointment(value: unknown, jobIds: string[], date: string): value is RouteAppointment {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.jobId === "string" && /^\d+$/.test(v.jobId) && jobIds.includes(v.jobId)
    && validRouteDateTime(v.expectedScheduled) && v.expectedScheduled.slice(0, 10) === date
    && validRouteDateTime(v.scheduled) && v.scheduled.slice(0, 10) >= date;
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
