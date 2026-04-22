"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

type Job = {
  id: string | number;
  customer?: string | null;
  phone?: string | null;
  vehicle?: string | null;
  unit_number?: string | null;
  address?: string | null;
  notes?: string | null;
  tires?: string | null;
  size?: string | null;
  qty?: string | number | null;
  scheduled?: string | null;
  complete?: boolean | null;
  vehicle_id?: string | null;
  service_type?: string | null;
  po_number?: string | null;
  billing_name?: string | null;
  job_total?: string | number | null;
  payment_status?: string | null;
  invoice_number?: string | null;
  job_status?: string | null;
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

function formatDateTimeNY(input?: string | null) {
  const date = parseJobDate(input);
  if (!date) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value?: string | number | null) {
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

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const searchParams = useSearchParams();

  const customerFilter = searchParams.get("customer") || "";

  const fetchJobs = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        customer,
        phone,
        vehicle,
        unit_number,
        address,
        notes,
        tires,
        size,
        qty,
        scheduled,
        complete,
        vehicle_id,
        service_type,
        po_number,
        billing_name,
        job_total,
        payment_status,
        invoice_number,
        job_status
      `);

    if (error) {
      console.error("Error fetching jobs:", error.message);
      setJobs([]);
      setLoading(false);
      return;
    }

    setJobs((data as Job[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    if (customerFilter) {
      result = result.filter((job) =>
        (job.customer || "")
          .toLowerCase()
          .includes(customerFilter.toLowerCase())
      );
    }

    return result.sort((a, b) =>
      (b.scheduled || "").localeCompare(a.scheduled || "")
    );
  }, [jobs, customerFilter]);

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={eyebrow}>Jobs</div>
              <h1 style={title}>All Jobs</h1>
              <p style={subtitle}>
                Open, review, and manage every job in one place.
              </p>
            </div>

            <Link href="/jobs/new" style={{ textDecoration: "none" }}>
              <button type="button" style={blueButton}>
                ➕ Add Job
              </button>
            </Link>
          </div>
        </div>

        {customerFilter ? (
          <div style={filterBanner}>
            <div>
              Showing jobs for: <strong>{customerFilter}</strong>
            </div>

            <button
              type="button"
              style={clearBtn}
              onClick={() => router.push("/jobs")}
            >
              Clear
            </button>
          </div>
        ) : null}

        {loading ? (
          <div style={loadingBox}>Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div style={emptyBox}>No jobs found.</div>
        ) : (
          filteredJobs.map((job) => {
            const tireText = [job.qty, job.tires || job.size]
              .filter(Boolean)
              .join(" • ");

            const unitOrVehicle = job.unit_number || job.vehicle || "";
            const total = formatMoney(job.job_total);

            return (
              <div
                key={job.id}
                style={card}
                onClick={() => router.push(`/jobs/${job.id}`)}
              >
                <div style={cardTop}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={customer}>{job.customer || "Unnamed Job"}</div>

                    {unitOrVehicle ? <div style={sub}>🚗 {unitOrVehicle}</div> : null}
                    {job.address ? <div style={sub}>📍 {job.address}</div> : null}
                    {job.phone ? <div style={sub}>📞 {job.phone}</div> : null}
                    {job.service_type ? <div style={sub}>🔧 {job.service_type}</div> : null}
                    {job.po_number ? <div style={sub}>📄 PO: {job.po_number}</div> : null}
                    {job.billing_name ? <div style={sub}>💵 Bill To: {job.billing_name}</div> : null}
                    {tireText ? <div style={sub}>🛞 {tireText}</div> : null}
                    {job.notes ? <div style={notes}>📝 {job.notes}</div> : null}
                    {job.scheduled ? (
                      <div style={time}>🕒 {formatDateTimeNY(job.scheduled)}</div>
                    ) : null}
                  </div>

                  <div style={rightSide}>
                    <div
                      style={{
                        ...tag,
                        background: vehicleColor(job.vehicle_id),
                      }}
                    >
                      {vehicleLabel(job.vehicle_id)}
                    </div>

                    <div style={infoTag}>
                      {job.job_status || (job.complete ? "completed" : "scheduled")}
                    </div>

                    <div style={infoTag}>
                      {job.payment_status || "unpaid"}
                    </div>

                    {total ? <div style={moneyTag}>{total}</div> : null}

                    {job.invoice_number ? (
                      <div style={infoTag}>Inv: {job.invoice_number}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  background: "#f8fafc",
  minHeight: "100vh",
};

const page: React.CSSProperties = {
  padding: 20,
  maxWidth: 1000,
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
  fontWeight: 700,
  textTransform: "uppercase",
  color: "#6b7280",
  marginBottom: 6,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  color: "#111827",
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#4b5563",
  fontSize: 15,
};

const baseButton: React.CSSProperties = {
  padding: "11px 14px",
  border: "none",
  borderRadius: 10,
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
  WebkitAppearance: "none",
  appearance: "none",
};

const blueButton: React.CSSProperties = {
  ...baseButton,
  background: "#2563eb",
};

const filterBanner: React.CSSProperties = {
  background: "#e0f2fe",
  border: "1px solid #bae6fd",
  padding: 12,
  borderRadius: 12,
  marginBottom: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const clearBtn: React.CSSProperties = {
  background: "#111827",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const loadingBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "white",
  border: "1px solid #e5e7eb",
  fontSize: 14,
};

const emptyBox: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "white",
  border: "1px dashed #d1d5db",
  color: "#6b7280",
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 16,
  marginTop: 12,
  borderRadius: 16,
  background: "white",
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const customer: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 18,
  marginBottom: 6,
  color: "#111827",
};

const sub: React.CSSProperties = {
  fontSize: 14,
  marginTop: 4,
  wordBreak: "break-word",
  color: "#374151",
};

const notes: React.CSSProperties = {
  fontSize: 13,
  marginTop: 8,
  color: "#4b5563",
  background: "#f9fafb",
  padding: 8,
  borderRadius: 8,
};

const time: React.CSSProperties = {
  fontSize: 13,
  marginTop: 8,
  color: "#374151",
};

const rightSide: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "flex-end",
};

const tag: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  color: "black",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const infoTag: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#e5e7eb",
  color: "#111827",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const moneyTag: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};