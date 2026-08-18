"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import KingdomPortalGate from "@/components/KingdomPortalGate";

type KingdomJob = {
  id: string | number;
  scheduled: string | null;
  vehicle: string | null;
  unit_number: string | null;
  service_type: string | null;
  tires: string | null;
  size: string | null;
  qty: number | string | null;
  po_number: string | null;
  mo_number: string | null;
  job_status: string | null;
  customer_order_status: string | null;
  complete: boolean | null;
};

const NY_TIMEZONE = "America/New_York";

function parseJobDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value.trim().replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getNYDateKey(value: string | Date) {
  const date = value instanceof Date ? value : parseJobDate(value) || new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function startOfWeek(value: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: NY_TIMEZONE, weekday: "short" }).format(value);
  const index = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday] ?? 1;
  return addDays(getNYDateKey(value), index === 0 ? -6 : 1 - index);
}

function formatDay(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00Z`));
}

function formatTime(value?: string | null) {
  const date = parseJobDate(value);
  if (!date) return "Time not assigned";
  return new Intl.DateTimeFormat("en-US", { timeZone: NY_TIMEZONE, hour: "numeric", minute: "2-digit" }).format(date);
}

function formatStatus(job: KingdomJob) {
  if (job.complete || job.job_status === "completed") {
    return "Completed";
  }

  switch (job.job_status) {
    case "en_route":
      return "En Route";
    case "on_site":
      return "On Site";
    case "scheduled":
      return "Scheduled";
    default:
      return "Approved";
  }
}

function statusStyle(job: KingdomJob): React.CSSProperties {
  if (job.complete || job.job_status === "completed") {
    return {
      ...statusBadge,
      background: "#ecfdf5",
      color: "#166534",
      borderColor: "#bbf7d0",
    };
  }

  if (job.job_status === "en_route" || job.job_status === "on_site") {
    return {
      ...statusBadge,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  return {
    ...statusBadge,
    background: "#eff6ff",
    color: "#1d4ed8",
    borderColor: "#bfdbfe",
  };
}

export default function KingdomSchedulePage() {
  const [jobs, setJobs] = useState<KingdomJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    const loadJobs = async () => {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("jobs")
        .select(`
          id,
          scheduled,
          vehicle,
          unit_number,
          service_type,
          tires,
          size,
          qty,
          po_number,
          mo_number,
          job_status,
          customer_order_status,
          complete
        `)
        .eq("customer", "Kingdom Support Services")
        .eq("submitted_by_customer", true)
        .eq("customer_order_status", "approved")
        .eq("archived", false)
        .order("scheduled", { ascending: true });

      setLoading(false);

      if (error) {
        setErrorMessage(
          `Scheduled work could not be loaded. ${error.message}`
        );
        return;
      }

      setJobs((data || []) as KingdomJob[]);
    };

    loadJobs();
  }, []);

  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const dateKey = addDays(weekStart, index);
    return { dateKey, label: formatDay(dateKey) };
  }), [weekStart]);

  const jobsByDay = useMemo(() => {
    const grouped: Record<string, KingdomJob[]> = Object.fromEntries(weekDays.map((day) => [day.dateKey, []]));
    jobs.forEach((job) => {
      if (!job.scheduled) return;
      const dateKey = getNYDateKey(job.scheduled);
      if (grouped[dateKey]) grouped[dateKey].push(job);
    });
    return grouped;
  }, [jobs, weekDays]);

  const visibleJobCount = Object.values(jobsByDay).reduce((total, items) => total + items.length, 0);

  return (
    <KingdomPortalGate><main style={pageShell}>
      <header style={header}>
        <div style={headerInner}>
          <img src="/bolt-logo.png" alt="Bolt Tire" style={logo} />

          <div style={headerText}>
            <strong style={brandName}>Bolt Tire</strong>
            <span style={brandSubtitle}>Mobile Tire Service</span>
          </div>
        </div>
      </header>

      <div style={pageContent}>
        <section style={heroCard}>
          <div style={eyebrow}>Kingdom Support Services</div>
          <h1 style={title}>Weekly Schedule</h1>

          <p style={subtitle}>
            View approved tire-service appointments by week, Monday through Friday.
          </p>

          <Link href="/order/kingdom" style={backButton}>
            Submit a New Request
          </Link>
          <Link href="/kingdom-orders" style={{ ...backButton, marginLeft: 10, background: "#e2e8f0", color: "#0f172a" }}>
            Search All Orders
          </Link>
        </section>

        {loading && (
          <section style={messageCard}>
            Loading scheduled work...
          </section>
        )}

        {!loading && errorMessage && (
          <section style={errorCard}>{errorMessage}</section>
        )}

        {!loading && !errorMessage && <>
          <div style={weekControls}>
            <button type="button" style={weekButton} onClick={() => setWeekStart((value) => addDays(value, -7))}>← Previous Week</button>
            <button type="button" style={thisWeekButton} onClick={() => setWeekStart(startOfWeek(new Date()))}>This Week</button>
            <label style={weekPickerLabel}>Choose week<input type="date" value={weekStart} onChange={(event) => event.target.value && setWeekStart(startOfWeek(new Date(`${event.target.value}T12:00:00`)))} style={weekPicker} /></label>
            <button type="button" style={weekButton} onClick={() => setWeekStart((value) => addDays(value, 7))}>Next Week →</button>
          </div>

          <div style={weekSummary}>{visibleJobCount} scheduled job{visibleJobCount === 1 ? "" : "s"} this week</div>

          <div className="kingdom-week-grid" style={weekGrid}>
            {weekDays.map((day) => <section key={day.dateKey} style={dayColumn}>
              <div style={dayHeader}><strong>{day.label}</strong><span>{jobsByDay[day.dateKey].length} job{jobsByDay[day.dateKey].length === 1 ? "" : "s"}</span></div>
              <div style={dayBody}>
                {jobsByDay[day.dateKey].length === 0 ? <div style={emptyDay}>No work scheduled</div> : jobsByDay[day.dateKey].map((job) => <article key={job.id} style={jobCard}>
                  <div style={jobHeader}><div style={jobTime}>{formatTime(job.scheduled)}</div><span style={statusStyle(job)}>{formatStatus(job)}</span></div>
                  <div style={compactDetails}>
                    <Detail label="Vehicle" value={[job.vehicle, job.unit_number && `Unit ${job.unit_number}`].filter(Boolean).join(" • ") || "Not provided"} />
                    <Detail label="Service" value={job.service_type || "Tire service"} />
                    <Detail label="Tires" value={[job.qty ? `${job.qty} tire${Number(job.qty) === 1 ? "" : "s"}` : "", job.tires, job.size].filter(Boolean).join(" • ") || "Not provided"} />
                    <Detail label="Reference" value={[job.po_number && `Job/PO ${job.po_number}`, job.mo_number && `MO ${job.mo_number}`].filter(Boolean).join(" • ") || "Not provided"} />
                  </div>
                </article>)}
              </div>
            </section>)}
          </div>
          <style jsx>{`@media (max-width: 900px) { .kingdom-week-grid { grid-template-columns: 1fr !important; } }`}</style>
        </>}

        <p style={privacyNote}>
          This page shows scheduling and work-order details only. Customer
          contact information, service addresses, internal notes, and pricing
          are not displayed.
        </p>
      </div>
    </main></KingdomPortalGate>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={detailBox}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  );
}

const pageShell: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  color: "#111827",
};

const header: React.CSSProperties = {
  background: "#ffffff",
  borderBottom: "1px solid #e5e7eb",
};

const headerInner: React.CSSProperties = {
  width: "100%",
  maxWidth: 1500,
  margin: "0 auto",
  padding: "12px 18px",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const logo: React.CSSProperties = {
  height: 44,
  width: "auto",
  objectFit: "contain",
};

const headerText: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  lineHeight: 1.2,
};

const brandName: React.CSSProperties = {
  fontSize: 17,
  color: "#111827",
};

const brandSubtitle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: "#6b7280",
};

const pageContent: React.CSSProperties = {
  width: "100%",
  maxWidth: 1500,
  margin: "0 auto",
  padding: "22px 16px 48px",
  boxSizing: "border-box",
};

const heroCard: React.CSSProperties = {
  padding: "22px 20px",
  marginBottom: 16,
  borderRadius: 18,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  boxShadow: "0 3px 12px rgba(15, 23, 42, 0.06)",
};

const eyebrow: React.CSSProperties = {
  marginBottom: 7,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "#2563eb",
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  lineHeight: 1.15,
  color: "#111827",
};

const subtitle: React.CSSProperties = {
  maxWidth: 650,
  margin: "12px 0 0",
  fontSize: 15,
  lineHeight: 1.6,
  color: "#4b5563",
};

const backButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 16,
  padding: "11px 15px",
  borderRadius: 10,
  background: "#2563eb",
  color: "#ffffff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 800,
};

const weekControls: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 9,
  flexWrap: "wrap",
  marginBottom: 10,
};

const weekButton: React.CSSProperties = {
  minHeight: 42,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#e5e7eb",
  color: "#0f172a",
  fontWeight: 800,
  cursor: "pointer",
};

const thisWeekButton: React.CSSProperties = {
  ...weekButton,
  background: "#2563eb",
  borderColor: "#2563eb",
  color: "#ffffff",
};

const weekPickerLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
};

const weekPicker: React.CSSProperties = {
  minHeight: 42,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 700,
};

const weekSummary: React.CSSProperties = {
  marginBottom: 12,
  color: "#475569",
  fontSize: 13,
  fontWeight: 700,
};

const weekGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 10,
  alignItems: "start",
};

const dayColumn: React.CSSProperties = {
  minWidth: 0,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#f8fafc",
  overflow: "hidden",
};

const dayHeader: React.CSSProperties = {
  minHeight: 68,
  padding: "13px 12px",
  background: "#e2e8f0",
  color: "#111827",
  borderBottom: "1px solid #cbd5e1",
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 14,
};

const dayBody: React.CSSProperties = {
  minHeight: 180,
  padding: 9,
  display: "grid",
  alignContent: "start",
  gap: 9,
};

const emptyDay: React.CSSProperties = {
  padding: "22px 8px",
  textAlign: "center",
  color: "#94a3b8",
  fontSize: 13,
};

const compactDetails: React.CSSProperties = {
  display: "grid",
  gap: 7,
  marginTop: 10,
};

const jobList: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const jobCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
};

const jobHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  paddingBottom: 9,
  borderBottom: "1px solid #e5e7eb",
};

const jobDate: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  color: "#111827",
};

const jobTime: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#2563eb",
};

const statusBadge: React.CSSProperties = {
  flexShrink: 0,
  padding: "7px 10px",
  borderRadius: 999,
  border: "1px solid",
  fontSize: 12,
  fontWeight: 800,
};

const detailsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const detailBox: React.CSSProperties = {
  padding: 9,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
};

const detailLabel: React.CSSProperties = {
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "#6b7280",
};

const detailValue: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.45,
  fontWeight: 650,
  color: "#1f2937",
};

const messageCard: React.CSSProperties = {
  padding: "32px 20px",
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  textAlign: "center",
  color: "#4b5563",
};

const errorCard: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  fontWeight: 650,
};

const emptyTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  color: "#111827",
};

const emptyText: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 14,
  color: "#6b7280",
};

const privacyNote: React.CSSProperties = {
  margin: "18px 8px 0",
  textAlign: "center",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#6b7280",
};
