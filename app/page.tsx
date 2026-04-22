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

const NY_TIMEZONE = "America/New_York";

function parseJobDate(input?: string | null) {
  if (!input) return null;

  const value = input.trim();
  if (!value) return null;

  const hasTimezone =
    value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);

  if (hasTimezone) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  const localValue = value.replace(" ", "T");
  const d = new Date(localValue);

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

function vehicleLabel(vehicleId?: string | null) {
  return vehicleId === "stepvan" ? "Stepvan" : "Service";
}

function vehicleColor(vehicleId?: string | null) {
  return vehicleId === "stepvan" ? "#2563eb" : "#facc15";
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchJobs = async () => {
    setLoading(true);

    try {
      const result = await Promise.race([
        supabase
          .from("jobs")
          .select(`
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
          `),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout fetching jobs")), 5000)
        ),
      ]);

      const { data, error } = result as {
        data: Job[] | null;
        error: { message: string } | null;
      };

      if (error) {
        console.error("Dashboard fetch error:", error.message);
        setJobs([]);
        setLoading(false);
        return;
      }

      setJobs(data || []);
      setLoading(false);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err?.message || err);
      setJobs([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const todayKey = useMemo(() => getNYDateKey(new Date().toISOString()), []);

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

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={eyebrow}>Bolt Tire</div>
              <h1 style={heroTitle}>Home</h1>
              <p style={subtitle}>
                Active jobs, today’s schedule, and quick access to the work that matters most.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/jobs/new")}
              style={primaryButton}
            >
              + Add Job
            </button>
          </div>
        </div>

        <div style={summaryGrid}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Today</div>
            <div style={summaryValue}>{todaysJobs.length}</div>
          </div>

          <div style={summaryCard}>
            <div style={summaryLabel}>Upcoming</div>
            <div style={summaryValue}>{upcomingJobs.length}</div>
          </div>

          <div style={summaryCard}>
            <div style={summaryLabel}>Open Jobs</div>
            <div style={summaryValue}>{scheduledJobs.length}</div>
          </div>
        </div>

        {loading && <div style={loadingBox}>Loading jobs...</div>}

        {!loading && (
          <>
            <section style={sectionWrap}>
              <div style={sectionHeader}>
                <h2 style={sectionTitle}>Today</h2>
                <div style={sectionBadge}>{todaysJobs.length}</div>
              </div>

              {todaysJobs.length === 0 ? (
                <div style={emptyState}>No jobs scheduled for today.</div>
              ) : (
                todaysJobs.map((job) => <JobCard key={job.id} job={job} />)
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
                upcomingJobs.map((job) => <JobCard key={job.id} job={job} />)
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const router = useRouter();

  const total = formatMoney(job.job_total);
  const vehicleName = vehicleLabel(job.vehicle_id);
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
            background: vehicleColor(job.vehicle_id),
          }}
        >
          {vehicleName}
        </div>
      </div>

      <div style={infoGrid}>
        <div style={infoItem}>
          <div style={infoLabel}>Service</div>
          <div style={infoValue}>{job.service_type || "-"}</div>
        </div>

        <div style={infoItem}>
          <div style={infoLabel}>PO #</div>
          <div style={infoValue}>{job.po_number || "-"}</div>
        </div>

        <div style={infoItem}>
          <div style={infoLabel}>Size / Qty</div>
          <div style={infoValue}>
            {job.size || "-"}
            {job.qty !== null && job.qty !== undefined && job.qty !== ""
              ? ` / ${job.qty}`
              : ""}
          </div>
        </div>

        <div style={infoItem}>
          <div style={infoLabel}>Total</div>
          <div style={infoValueStrong}>{total || "-"}</div>
        </div>

        <div style={infoItem}>
          <div style={infoLabel}>Billing</div>
          <div style={infoValue}>{payment}</div>
        </div>

        <div style={infoItem}>
          <div style={infoLabel}>Invoice</div>
          <div style={infoValue}>{job.invoice_number || "-"}</div>
        </div>

        <div style={infoItem}>
          <div style={infoLabel}>Status</div>
          <div style={infoValue}>{status}</div>
        </div>

        <div style={infoItem}>
          <div style={infoLabel}>Bill To</div>
          <div style={infoValue}>{job.billing_name || "-"}</div>
        </div>
      </div>
    </div>
  );
}

/* STYLES */

const shell: React.CSSProperties = {
  background: "#f8fafc",
  minHeight: "100vh",
};

const page: React.CSSProperties = {
  padding: 18,
  maxWidth: 1050,
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

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const summaryCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const summaryLabel: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  marginBottom: 8,
  fontWeight: 700,
  textTransform: "uppercase",
};

const summaryValue: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
  color: "#111827",
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
  color: "black",
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