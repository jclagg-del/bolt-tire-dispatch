"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";

type ReceivingJob = {
  id: string;
  customer: string | null;
  mo_number: string | null;
  tires: string | null;
  size: string | null;
  tire_product_number: string | null;
  qty: number | null;
  scheduled: string | null;
};

function formatScheduled(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function TireReceivingPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ReceivingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("jobs")
      .select("id,customer,mo_number,tires,size,tire_product_number,qty,scheduled")
      .eq("tires_received", false)
      .eq("archived", false)
      .eq("complete", false)
      .order("scheduled", { ascending: true, nullsFirst: false });

    if (loadError) {
      setError(`Could not load tire receiving: ${loadError.message}`);
      setJobs([]);
    } else {
      setJobs((data || []) as ReceivingJob[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const upcomingJobs = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return jobs.filter((job) => {
      if (!job.scheduled) return true;
      const scheduled = new Date(job.scheduled);
      return Number.isNaN(scheduled.getTime()) || scheduled >= startOfToday;
    });
  }, [jobs]);

  const markReceived = async (job: ReceivingJob) => {
    setUpdatingId(job.id);
    setError("");

    const { error: updateError } = await supabase
      .from("jobs")
      .update({ tires_received: true })
      .eq("id", job.id);

    if (updateError) {
      setError(`Could not update ${job.customer || "this job"}: ${updateError.message}`);
    } else {
      setJobs((current) => current.filter((item) => item.id !== job.id));
    }
    setUpdatingId(null);
  };

  return (
    <div style={shell}>
      <AppHeader />
      <main style={page}>
        <section style={hero}>
          <div>
            <div style={eyebrow}>Inventory</div>
            <h1 style={title}>Tire Receiving</h1>
            <p style={subtitle}>Upcoming jobs still waiting for tires.</p>
          </div>
          <div style={count}>{upcomingJobs.length} waiting</div>
        </section>

        {error && <div style={errorBox}>{error}</div>}

        {loading ? (
          <div style={message}>Loading upcoming tires...</div>
        ) : upcomingJobs.length === 0 ? (
          <div style={empty}>
            <div style={checkmark}>✓</div>
            <h2 style={emptyTitle}>All upcoming tires are received</h2>
            <p style={emptyText}>There are no jobs waiting for tire delivery.</p>
          </div>
        ) : (
          <div style={list}>
            {upcomingJobs.map((job) => {
              const description = [job.tires, job.size].filter(Boolean).join(" • ") || "No tire description";
              const updating = updatingId === job.id;

              return (
                <article key={job.id} style={card}>
                  <button type="button" style={details} onClick={() => router.push(`/jobs/${job.id}`)}>
                    <div style={customer}>{job.customer || "Unnamed customer"}</div>
                    <div style={scheduled}>{formatScheduled(job.scheduled)}</div>
                    <div style={fields}>
                      <Info label="MO" value={job.mo_number || "—"} />
                      <Info label="Tire description" value={description} />
                      <Info label="Product number" value={job.tire_product_number || "—"} />
                      <Info label="Quantity" value={job.qty ? String(job.qty) : "—"} />
                    </div>
                  </button>
                  <button
                    type="button"
                    style={{ ...receivedButton, ...(updating ? disabledButton : {}) }}
                    disabled={updating}
                    onClick={() => markReceived(job)}
                  >
                    {updating ? "Updating..." : "✓ Received"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div style={labelStyle}>{label}</div><div style={valueStyle}>{value}</div></div>;
}

const shell: React.CSSProperties = { minHeight: "100vh", background: "#f3f4f6" };
const page: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: "24px 16px 48px" };
const hero: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: 24, marginBottom: 18, boxShadow: "0 4px 12px rgba(15,23,42,.05)" };
const eyebrow: React.CSSProperties = { color: "#2563eb", fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" };
const title: React.CSSProperties = { margin: "4px 0", fontSize: 32, color: "#111827" };
const subtitle: React.CSSProperties = { margin: 0, color: "#6b7280" };
const count: React.CSSProperties = { background: "#fef3c7", color: "#92400e", borderRadius: 999, padding: "10px 16px", fontWeight: 800 };
const list: React.CSSProperties = { display: "grid", gap: 12 };
const card: React.CSSProperties = { display: "flex", alignItems: "stretch", gap: 14, flexWrap: "wrap", background: "white", border: "1px solid #dbe2ea", borderRadius: 16, padding: 16, boxShadow: "0 2px 8px rgba(15,23,42,.05)" };
const details: React.CSSProperties = { flex: "1 1 700px", minWidth: 0, padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer", color: "inherit" };
const customer: React.CSSProperties = { color: "#111827", fontSize: 21, fontWeight: 800 };
const scheduled: React.CSSProperties = { color: "#2563eb", fontSize: 14, fontWeight: 700, marginTop: 3 };
const fields: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginTop: 16 };
const labelStyle: React.CSSProperties = { color: "#6b7280", fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: "uppercase", marginBottom: 4 };
const valueStyle: React.CSSProperties = { color: "#1f2937", fontSize: 16, fontWeight: 650, overflowWrap: "anywhere" };
const receivedButton: React.CSSProperties = { alignSelf: "center", minHeight: 54, padding: "14px 22px", border: 0, borderRadius: 12, background: "#15803d", color: "white", fontSize: 16, fontWeight: 800, cursor: "pointer" };
const disabledButton: React.CSSProperties = { opacity: .6, cursor: "wait" };
const message: React.CSSProperties = { background: "white", borderRadius: 14, padding: 28, textAlign: "center", color: "#6b7280" };
const empty: React.CSSProperties = { background: "white", border: "1px solid #bbf7d0", borderRadius: 18, padding: "48px 20px", textAlign: "center" };
const checkmark: React.CSSProperties = { width: 58, height: 58, borderRadius: 999, background: "#dcfce7", color: "#15803d", fontSize: 34, lineHeight: "58px", margin: "0 auto 12px", fontWeight: 900 };
const emptyTitle: React.CSSProperties = { color: "#166534", margin: "0 0 6px" };
const emptyText: React.CSSProperties = { color: "#6b7280", margin: 0 };
const errorBox: React.CSSProperties = { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 12, padding: 14, marginBottom: 14, fontWeight: 650 };
