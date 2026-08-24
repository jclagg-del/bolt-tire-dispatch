import { createAdminClient } from "@/lib/supabase/admin";

export const SHOP_APPOINTMENT_TIMES = [
  { value: "08:00", label: "8:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "14:00", label: "2:00 PM" },
];

const VEHICLES = ["stepvan", "sprinter"];
const JOB_MINUTES = 90;
const TRAVEL_BUFFER = 30;

function minutes(value: string) {
  const [hour, minute] = value.substring(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function nyParts(value: string) {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number(get("hour")) === 24 ? 0 : Number(get("hour"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")) };
}

function weekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return value >= 1 && value <= 5;
}

function addDays(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + amount);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export async function availableShopTimes(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !weekday(date)) return [];
  const admin = createAdminClient();
  const [{ data: jobs, error: jobsError }, { data: holds, error: holdsError }] = await Promise.all([
    admin.from("jobs").select("scheduled,vehicle_id,complete,archived").eq("complete", false).eq("archived", false).gte("scheduled", `${addDays(date, -1)}T00:00:00`).lt("scheduled", `${addDays(date, 2)}T00:00:00`),
    admin.from("quotes").select("requested_time").eq("purchase_source", "website").eq("requested_date", date).is("converted_job_id", null).gt("appointment_hold_expires_at", new Date().toISOString()),
  ]);
  if (jobsError || holdsError) throw new Error(jobsError?.message || holdsError?.message || "Availability could not be loaded");

  return SHOP_APPOINTMENT_TIMES.filter((slot) => {
    const start = minutes(slot.value);
    const end = start + JOB_MINUTES;
    const busyVehicles = new Set<string>();
    for (const job of jobs || []) {
      if (!job.scheduled) continue;
      const parsed = nyParts(job.scheduled);
      if (!parsed || parsed.date !== date) continue;
      const jobEnd = parsed.minutes + JOB_MINUTES;
      if (start < jobEnd + TRAVEL_BUFFER && parsed.minutes - TRAVEL_BUFFER < end) busyVehicles.add(job.vehicle_id || "stepvan");
    }
    let occupied = busyVehicles.size;
    for (const hold of holds || []) {
      const heldStart = minutes(String(hold.requested_time || ""));
      if (start < heldStart + JOB_MINUTES + TRAVEL_BUFFER && heldStart - TRAVEL_BUFFER < end) occupied += 1;
    }
    return occupied < VEHICLES.length;
  });
}
