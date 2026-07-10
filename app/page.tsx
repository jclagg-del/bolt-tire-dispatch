"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

type Job = {
  id: string | number;
  customer?: string | null;
  vehicle?: string | null;
  vehicle_id?: string | null;
  unit_number?: string | null;
  address?: string | null;
  scheduled?: string | null;
  complete?: boolean | null;
  service_type?: string | null;
  po_number?: string | null;
  size?: string | null;
  qty?: number | string | null;
  job_total?: number | string | null;
  payment_status?: string | null;
  invoice_number?: string | null;
  job_status?: string | null;
  billing_name?: string | null;
};

type Vehicle = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  sort_order: number;
};

type Assignment = {
  assignment_date: string;
  vehicle_id: string;
  technician_name: string;
};

const NY_TIMEZONE = "America/New_York";

const fallbackVehicles: Vehicle[] = [
  { id: "stepvan", name: "Stepvan", color: "#2563eb", active: true, sort_order: 1 },
  { id: "service", name: "Service Truck", color: "#facc15", active: true, sort_order: 2 },
  { id: "sprinter", name: "Sprinter", color: "#10b981", active: true, sort_order: 3 },
];

function parseJobDate(input?: string | null) {
  if (!input) return null;
  const value = input.trim();
  if (!value) return null;

  const hasTimezone = value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);

  if (hasTimezone) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function getNYDateKey(input?: string | null) {
  const date = parseJobDate(input);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function formatDateTimeNY(input?: string | null) {
  const date = parseJobDate(input);
  if (!date) return "Invalid date";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return `$${num.toFixed(2)}`;
}

function getTextColor(background: string) {
  const hex = background.replace("#", "");
  if (hex.length !== 6) return "white";

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness > 150 ? "#111827" : "white";
}

export default function DashboardPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>(fallbackVehicles);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const todayKey = useMemo(() => getNYDateKey(new Date().toISOString()), []);

  const fetchVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id,name,color,active,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      setVehicles(fallbackVehicles);
      return;
    }

    setVehicles(data as Vehicle[]);
  };

  const fetchAssignments = async () => {
    const { data, error } = await supabase
      .from("vehicle_daily_assignments")
      .select("assignment_date,vehicle_id,technician_name")
      .eq("assignment_date", todayKey);

    if (error) {
      console.error("Dashboard technician assignment error:", error.message);
      setAssignments({});
      return;
    }

    const map: Record<string, string> = {};
    ((data as Assignment[]) || []).forEach((row) => {
      map[row.vehicle_id] = row.technician_name || "";
    });

    setAssignments(map);
  };

  const fetchNewOrders = async () => {
    const { count, error } = await supabase
      .from("customer_orders")
      .select("id", { count: "exact", head: true })
      .eq("order_status", "new");

    if (error) {
      console.error("Dashboard customer order count error:", error.message);
      setNewOrdersCount(0);
      return;
    }

    setNewOrdersCount(count || 0);
  };

  const fetchJobs = async () => {
    const { data, error } = await supabase.from("jobs").select(`
      id,
      customer,
      vehicle,
      vehicle_id,
      unit_number,
      address,
      scheduled,
      complete,
      service_type,
      po_number,
      size,
      qty,
      job_total,
      payment_status,
      invoice_number,
      job_status,
      billing_name
    `);

    if (error) {
      console.error("Dashboard fetch error:", error.message);
      setJobs([]);
      return;
    }

    setJobs((data as Job[]) || []);
  };

  const loadDashboard = async () => {
    setLoading(true);
    await Promise.all([
      fetchVehicles(),
      fetchAssignments(),
      fetchJobs(),
      fetchNewOrders(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const vehicleMap = useMemo(() => {
    const map: Record<string, Vehicle> = {};
    vehicles.forEach((vehicle) => {
      map[vehicle.id] = vehicle;
    });
    return map;
  }, [vehicles]);

  const scheduledJobs = useMemo(() => {
    return jobs.filter((j) => !!j.scheduled && !j.complete);
  }, [jobs]);

  const todaysJobs = useMemo(() => {
    return scheduledJobs
      .filter((j) => getNYDateKey(j.scheduled) === todayKey)
      .sort((a, b) => (a.scheduled || "").localeCompare(b.scheduled || ""));
  }, [scheduledJobs, todayKey]);

  const upcomingJobs = useMemo(() => {
    return scheduledJobs
      .filter((j) => getNYDateKey(j.scheduled) > todayKey)
      .sort((a, b) => (a.scheduled || "").localeCompare(b.scheduled || ""));
  }, [scheduledJobs, todayKey]);

  const completedJobs = useMemo(() => {
    return jobs.filter((j) => !!j.complete);
  }, [jobs]);

  const unpaidJobs = useMemo(() => {
    return jobs.filter((j) => (j.payment_status || "unpaid") !== "paid");
  }, [jobs]);

  const todayRevenue = useMemo(() => {
    return todaysJobs.reduce((sum, job) => {
      const value = Number(job.job_total || 0);
      return Number.isNaN(value) ? sum : sum + value;
    }, 0);
  }, [todaysJobs]);

  const jobsByVehicleToday = useMemo(() => {
    const grouped: Record<string, Job[]> = {};

    vehicles.forEach((vehicle) => {
      grouped[vehicle.id] = [];
    });

    todaysJobs.forEach((job) => {
      const vehicleId = job.vehicle_id || "stepvan";

      if (!grouped[vehicleId]) {
        grouped[vehicleId] = [];
      }

      grouped[vehicleId].push(job);
    });

    return grouped;
  }, [todaysJobs, vehicles]);

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={eyebrow}>Bolt Tire</div>
              <h1 style={heroTitle}>Dispatch Dashboard</h1>
              <p style={subtitle}>
                Today&apos;s jobs, vehicle assignments, and quick links to the pages you use most.
              </p>
            </div>

            <button type="button" onClick={() => router.push("/jobs/new")} style={primaryButton}>
              + Add Job
            </button>
          </div>
        </div>

        <div style={quickGrid}>
          <QuickCard
            label="New Orders"
            value={newOrdersCount}
            onClick={() => router.push("/orders")}
          />
          <QuickCard label="Open Jobs" value={scheduledJobs.length} onClick={() => router.push("/jobs")} />
          <QuickCard label="Today's Route" value={todaysJobs.length} onClick={() => router.push("/route")} />
          <QuickCard label="Schedule" value="Open" onClick={() => router.push("/schedule")} />
          <QuickCard label="Completed" value={completedJobs.length} onClick={() => router.push("/completed")} />
          <QuickCard label="Billing" value={unpaidJobs.length} onClick={() => router.push("/billing")} />
          <QuickCard label="Revenue Today" value={formatMoney(todayRevenue)} onClick={() => router.push("/billing")} />
        </div>

        {loading && <div style={loadingBox}>Loading dashboard...</div>}

        {!loading && (
          <>
            <section style={sectionWrap}>
              <div style={sectionHeader}>
                <h2 style={sectionTitle}>Today&apos;s Vehicles</h2>
                <div style={sectionBadge}>{vehicles.length}</div>
              </div>

              <div style={vehicleGrid}>
                {vehicles.map((vehicle) => {
                  const vehicleJobs = jobsByVehicleToday[vehicle.id] || [];
                  const techName = assignments[vehicle.id] || "No tech assigned";
                  const textColor = getTextColor(vehicle.color);

                  return (
                    <div
                      key={vehicle.id}
                      style={vehicleCard}
                      onClick={() => router.push("/route")}
                    >
                      <div
                        style={{
                          ...vehicleHeader,
                          background: vehicle.color,
                          color: textColor,
                        }}
                      >
                        {vehicle.name}
                      </div>

                      <div style={vehicleBody}>
                        <div style={vehicleTech}>{techName}</div>
                        <div style={vehicleJobsText}>
                          {vehicleJobs.length} job{vehicleJobs.length === 1 ? "" : "s"} today
                        </div>

                        {vehicleJobs[0] ? (
                          <div style={firstStop}>
                            First stop: {vehicleJobs[0].customer || "Unnamed Job"}
                          </div>
                        ) : (
                          <div style={firstStop}>No jobs scheduled</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section style={sectionWrap}>
              <div style={sectionHeader}>
                <h2 style={sectionTitle}>Today</h2>
                <div style={sectionBadge}>{todaysJobs.length}</div>
              </div>

              {todaysJobs.length === 0 ? (
                <div style={emptyState}>No jobs scheduled for today.</div>
              ) : (
                todaysJobs.map((job) => (
                  <JobCard key={job.id} job={job} vehicle={vehicleMap[job.vehicle_id || ""]} />
                ))
              )}
            </section>

            <section style={sectionWrap}>
              <div style={sectionHeader}>
                <h2 style={sectionTitle}>Upcoming</h2>
                <div style={sectionBadge}>{upcomingJobs.length}</div>
              </div>

              {upcomingJobs.length === 0 ? (
                <div style={emptyState}>No upcoming jobs.</div>
              ) : (
                upcomingJobs.slice(0, 10).map((job) => (
                  <JobCard key={job.id} job={job} vehicle={vehicleMap[job.vehicle_id || ""]} />
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function QuickCard({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string | number;
  onClick: () => void;
}) {
  return (
    <button type="button" style={quickCard} onClick={onClick}>
      <div style={quickLabel}>{label}</div>
      <div style={quickValue}>{value}</div>
    </button>
  );
}

function JobCard({ job, vehicle }: { job: Job; vehicle?: Vehicle }) {
  const router = useRouter();

  const total = formatMoney(job.job_total);
  const vehicleName = vehicle?.name || job.vehicle_id || "Unassigned";
  const vehicleBg = vehicle?.color || "#9ca3af";
  const vehicleText = getTextColor(vehicleBg);
  const payment = job.payment_status || "unpaid";
  const unitOrVehicle = job.unit_number || job.vehicle || "";
  const status = job.job_status || "scheduled";

  return (
    <div style={card} onClick={() => router.push(`/jobs/${job.id}`)}>
      <div style={topRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={customer}>{job.customer || "Unnamed Job"}</div>

          {unitOrVehicle ? <div style={sub}>{unitOrVehicle}</div> : null}
          {job.address ? <div style={address}>{job.address}</div> : null}
          {job.scheduled ? <div style={time}>🕒 {formatDateTimeNY(job.scheduled)}</div> : null}
        </div>

        <div
          style={{
            ...tag,
            background: vehicleBg,
            color: vehicleText,
          }}
        >
          {vehicleName}
        </div>
      </div>

      <div style={infoGrid}>
        <Info label="Service" value={job.service_type || "-"} />
        <Info label="PO #" value={job.po_number || "-"} />
        <Info
          label="Size / Qty"
          value={`${job.size || "-"}${
            job.qty !== null && job.qty !== undefined && job.qty !== "" ? ` / ${job.qty}` : ""
          }`}
        />
        <Info label="Total" value={total || "-"} strong />
        <Info label="Billing" value={payment} />
        <Info label="Invoice" value={job.invoice_number || "-"} />
        <Info label="Status" value={status} />
        <Info label="Bill To" value={job.billing_name || "-"} />
      </div>
    </div>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={infoItem}>
      <div style={infoLabel}>{label}</div>
      <div style={strong ? infoValueStrong : infoValue}>{value}</div>
    </div>
  );
}

const shell: React.CSSProperties = {
  background: "#f8fafc",
  minHeight: "100vh",
};

const page: React.CSSProperties = {
  padding: 18,
  maxWidth: 1150,
  margin: "0 auto",
};

const heroCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 18,
  marginBottom: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const heroTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 6,
};

const heroTitle: React.CSSProperties = {
  fontSize: 30,
  margin: 0,
  color: "#111827",
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  color: "#4b5563",
  fontSize: 15,
  maxWidth: 700,
  lineHeight: 1.45,
};

const primaryButton: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  color: "white",
  fontSize: 14,
  background: "#2563eb",
};

const quickGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const quickCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  textAlign: "left",
  cursor: "pointer",
};

const quickLabel: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  marginBottom: 8,
  fontWeight: 700,
  textTransform: "uppercase",
};

const quickValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: "#111827",
};

const sectionWrap: React.CSSProperties = {
  marginBottom: 22,
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  color: "#111827",
};

const sectionBadge: React.CSSProperties = {
  minWidth: 34,
  height: 34,
  borderRadius: 999,
  background: "#e5e7eb",
  color: "#111827",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: 14,
};

const vehicleGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const vehicleCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  cursor: "pointer",
};

const vehicleHeader: React.CSSProperties = {
  padding: 12,
  fontSize: 17,
  fontWeight: 800,
};

const vehicleBody: React.CSSProperties = {
  padding: 14,
};

const vehicleTech: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
};

const vehicleJobsText: React.CSSProperties = {
  marginTop: 6,
  color: "#374151",
  fontSize: 14,
};

const firstStop: React.CSSProperties = {
  marginTop: 8,
  color: "#6b7280",
  fontSize: 13,
};

const loadingBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "white",
  border: "1px solid #e5e7eb",
  fontSize: 14,
};

const emptyState: React.CSSProperties = {
  padding: 18,
  borderRadius: 14,
  background: "white",
  border: "1px dashed #d1d5db",
  color: "#6b7280",
  fontSize: 14,
};

const card: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: "white",
  marginBottom: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  cursor: "pointer",
  border: "1px solid #e5e7eb",
};

const topRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 14,
};

const customer: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 18,
  lineHeight: 1.2,
  color: "#111827",
};

const sub: React.CSSProperties = {
  fontSize: 14,
  color: "#374151",
  marginTop: 4,
};

const address: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  marginTop: 4,
  wordBreak: "break-word",
};

const time: React.CSSProperties = {
  fontSize: 13,
  color: "#555",
  marginTop: 6,
};

const tag: React.CSSProperties = {
  padding: "7px 11px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
};

const infoItem: React.CSSProperties = {
  background: "#f8fafc",
  borderRadius: 12,
  padding: 10,
  minWidth: 0,
  border: "1px solid #eef2f7",
};

const infoLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  marginBottom: 4,
};

const infoValue: React.CSSProperties = {
  fontSize: 14,
  color: "#111827",
  wordBreak: "break-word",
};

const infoValueStrong: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#111827",
  wordBreak: "break-word",
};