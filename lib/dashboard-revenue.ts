type CompletedJob = {
  complete?: boolean | null;
  completed_at?: string | null;
  job_total?: string | number | null;
  scheduled?: string | null;
  archived?: boolean | null;
};

export function revenueDateKey(value: string | Date): string {
  // Completion timestamps are timestamptz. Never interpret a missing timezone
  // in the viewer's local timezone, or substitute the appointment date.
  if (typeof value === "string" && !/(Z|[+-]\d{2}:\d{2})$/i.test(value.trim())) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export function dashboardRevenueForDay(jobs: CompletedJob[], day: string) {
  const completedCount = jobs.filter(job => job.complete === true && !!job.completed_at && revenueDateKey(job.completed_at) === day).length;
  const completedTotal = completedRevenueForDay(jobs, day);
  const scheduledCents = jobs.reduce((sum, job) => {
    if (!job.scheduled || job.archived) return sum;
    // The database stores appointment times as New York wall-clock timestamps.
    const scheduled = job.scheduled.trim();
    const date = /(Z|[+-]\d{2}:\d{2})$/i.test(scheduled) ? revenueDateKey(scheduled)
      : /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})/.test(scheduled) ? scheduled.slice(0, 10) : "";
    if (date !== day) return sum;
    const total = Number(job.job_total ?? 0);
    return Number.isFinite(total) ? sum + Math.round((total + Number.EPSILON) * 100) : sum;
  }, 0);
  const scheduledTotal = scheduledCents / 100;
  return { completedCount, completedTotal, scheduledTotal,
    mode: completedCount > 0 ? "completed" as const : "scheduled" as const,
    total: completedCount > 0 ? completedTotal : scheduledTotal };
}

export function completedRevenueForDay(jobs: CompletedJob[], day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;
  const cents = jobs.reduce((sum, job) => {
    if (job.complete !== true || !job.completed_at || revenueDateKey(job.completed_at) !== day) return sum;
    const total = Number(job.job_total ?? 0);
    return Number.isFinite(total) ? sum + Math.round((total + Number.EPSILON) * 100) : sum;
  }, 0);
  // Stored job totals include tax. Payment status and scheduled date do not
  // determine completed-work revenue. Archiving does not undo completed work.
  return cents / 100;
}
