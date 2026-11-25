import { isDeliveryService } from "@/lib/job-completion";
import { routeDate, validRouteDate } from "@/lib/route-order";

export type DeliveryJob = {
  id: string | number; customer?: string | null; facility_name?: string | null;
  address?: string | null; scheduled?: string | null; service_type?: string | null;
  complete?: boolean | null; archived?: boolean | null; job_status?: string | null;
  po_number?: string | null; mo_number?: string | null; tires?: string | null;
  size?: string | null; qty?: number | string | null;
};
export type DeliveryGroup<T extends DeliveryJob = DeliveryJob> = {
  key: string; organization: string; site: string; jobs: T[];
};
const normalized = (value?: string | null) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
export function fleetDeliveryOrganization(job: DeliveryJob): string | null {
  const customer = normalized(job.customer);
  return customer === "kingdom support services" ? "Kingdom Support Services" : customer === "hpr" ? "HPR" : null;
}
export function isFleetDelivery(job: DeliveryJob) {
  return !!fleetDeliveryOrganization(job) && isDeliveryService(job.service_type);
}
export function deliveryJobsForDate<T extends DeliveryJob>(jobs: T[], date: string): T[] {
  if (!validRouteDate(date)) return [];
  return jobs.filter(job => isFleetDelivery(job) && job.scheduled && routeDate(job.scheduled) === date
    && !(job.archived && !job.complete) && !["cancelled", "canceled", "void", "voided"].includes(normalized(job.job_status)))
    .sort((a,b) => (a.scheduled || "").localeCompare(b.scheduled || "") || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}
export function dailyDeliveryGroups<T extends DeliveryJob>(jobs: T[], date: string): DeliveryGroup<T>[] {
  const groups = new Map<string, DeliveryGroup<T>>();
  for (const job of deliveryJobsForDate(jobs, date)) {
    const organization = fleetDeliveryOrganization(job)!;
    const site = job.facility_name?.trim() || "Facility not set";
    // Distinct addresses and unknown destinations must not silently combine.
    const key = JSON.stringify([organization, normalized(site), normalized(job.address), site === "Facility not set" ? String(job.id) : ""]);
    const group = groups.get(key) || { key, organization, site, jobs: [] };
    group.jobs.push(job); groups.set(key, group);
  }
  return [...groups.values()].sort((a,b) => a.organization.localeCompare(b.organization) || a.site.localeCompare(b.site));
}
export function deliveryQuantity(job: DeliveryJob): number | null {
  const qty = Number(job.qty);
  return Number.isSafeInteger(qty) && qty > 0 ? qty : null;
}
export type DeliveryManifest = {
  date: string; organization: string; receivingSite: string; reference: string; total: number;
  lines: { id: string; jobNumber: string; moNumber: string; tires: string; size: string; finalSite: string; quantity: number }[];
};
export function createDeliveryManifest(date: string, organization: string, receivingSite: string, jobs: DeliveryJob[]): DeliveryManifest {
  const site = receivingSite.trim();
  if (!validRouteDate(date) || !site || site.length > 200 || site === "Facility not set") throw new Error("Enter the actual receiving site before printing.");
  if (!jobs.length) throw new Error("Select at least one delivery.");
  if (new Set(jobs.map(job => String(job.id))).size !== jobs.length) throw new Error("Duplicate jobs found. Reload deliveries before printing.");
  if (deliveryJobsForDate(jobs, date).length !== jobs.length || jobs.some(job => fleetDeliveryOrganization(job) !== organization)) throw new Error("A bill of lading must contain deliveries for one organization and one day only.");
  const lines = jobs.map(job => {
    const quantity = deliveryQuantity(job);
    if (quantity === null) throw new Error(`Enter a valid tire quantity on job ${job.po_number || job.id} before printing.`);
    return { id: String(job.id), jobNumber: job.po_number?.trim() || String(job.id), moNumber: job.mo_number?.trim() || "Not provided",
      tires: job.tires?.trim() || "Tire description not provided", size: job.size?.trim() || "Size not provided",
      finalSite: job.facility_name?.trim() || "Facility not set", quantity };
  });
  const total = lines.reduce((sum,line) => sum + line.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error("The total tire quantity is invalid.");
  // Stable identifier for a receiving site/day; not an invoice or proof of delivery.
  let hash = 2166136261;
  for (const char of `${organization}|${normalized(site)}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return { date, organization, receivingSite: site, reference: `${organization === "HPR" ? "HPR" : "KSS"}-${date.replace(/-/g, "")}-${(hash >>> 0).toString(36).toUpperCase()}`, total, lines };
}
