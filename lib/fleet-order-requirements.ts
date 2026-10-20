// Every organization using the fleet request/create/edit forms shares these rules.
// Requested times are local America/New_York wall-clock times, not UTC.
export const FLEET_APPOINTMENT_TIMES = [
  { value: "08:00", label: "8:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "14:00", label: "2:00 PM" },
];

export const FLEET_LUNCH_NOTICE = "Appointments cannot start between 12:00 PM and 1:00 PM (Eastern time). Please choose another time.";

export function fleetRequestedTime(value: unknown): string {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  // Accept database HH:mm:00, but never truncate arbitrary suffixes or seconds.
  return /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(clean) ? clean.slice(0, 5) : "";
}

export function isFleetLunchTime(value: unknown): boolean {
  return fleetRequestedTime(value).startsWith("12:");
}

export function fleetOrderRequirementsError(value: { job_number?: unknown; mo_number?: unknown; requested_time?: unknown }): string {
  if (typeof value.job_number !== "string" || !value.job_number.trim()) return "Please enter the Job / PO number.";
  if (typeof value.mo_number !== "string" || !value.mo_number.trim()) return "Please enter the MO number.";
  if (!fleetRequestedTime(value.requested_time)) return "Please select a valid requested service time.";
  if (isFleetLunchTime(value.requested_time)) return FLEET_LUNCH_NOTICE;
  return "";
}
