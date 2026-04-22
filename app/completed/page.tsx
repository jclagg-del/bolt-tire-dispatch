"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

type Job = {
  id: string | number;
  customer?: string | null;
  vehicle?: string | null;
  vehicle_mileage?: string | null;
  address?: string | null;
  phone?: string | null;
  contact_number?: string | null;
  scheduled?: string | null;
  completed_at?: string | null;
  complete?: boolean | null;
  notes?: string | null;
  tires?: string | null;
  size?: string | null;
  qty?: number | string | null;
};

const NY_TIMEZONE = "America/New_York";

function formatDateTimeNY(input?: string | null) {
  if (!input) return "";

  const date = new Date(input);
  if (isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function CompletedPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reopeningId, setReopeningId] = useState<string | number | null>(null);
  const router = useRouter();

  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("complete", true)
      .order("completed_at", { ascending: false });

    if (error) {
      alert(`Error loading completed jobs: ${error.message}`);
      return;
    }

    setJobs((data as Job[]) || []);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleReopen = async (id: string | number) => {
    setReopeningId(id);

    const { error } = await supabase
      .from("jobs")
      .update({
        complete: false,
        job_status: "scheduled",
        completed_at: null,
      })
      .eq("id", id);

    setReopeningId(null);

    if (error) {
      alert(`Error reopening job: ${error.message}`);
      return;
    }

    await fetchJobs();
  };

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={eyebrow}>Completed</div>
              <h1 style={title}>Completed Work</h1>
              <p style={subtitle}>
                Review finished jobs, mileage logs, and reopen if needed.
              </p>
            </div>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div style={empty}>No completed jobs yet</div>
        ) : (
          jobs.map((job) => (
            <div key={job.id} style={card}>
              <div style={cardTop}>
                <div style={customer}>{job.customer || "Unnamed Job"}</div>

                <div style={cardActions}>
                  <button
                    onClick={() => router.push(`/jobs/${job.id}`)}
                    style={editBtn}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleReopen(job.id)}
                    style={reopenBtn}
                    disabled={reopeningId === job.id}
                  >
                    {reopeningId === job.id ? "Updating..." : "Reopen"}
                  </button>
                </div>
              </div>

              {job.completed_at && (
                <div style={sub}>
                  ✅ Completed: {formatDateTimeNY(job.completed_at)}
                </div>
              )}

              {job.scheduled && (
                <div style={sub}>
                  🕒 Scheduled: {formatDateTimeNY(job.scheduled)}
                </div>
              )}

              {job.vehicle && <div style={sub}>🚗 {job.vehicle}</div>}

              {job.vehicle_mileage && (
                <div style={sub}>📊 Mileage: {job.vehicle_mileage}</div>
              )}

              {job.address && <div style={sub}>📍 {job.address}</div>}

              {(job.phone || job.contact_number) && (
                <div style={sub}>
                  📞 {job.phone || job.contact_number}
                </div>
              )}

              {job.tires && <div style={sub}>🛞 {job.tires}</div>}
              {job.size && <div style={sub}>📏 {job.size}</div>}

              {job.qty && <div style={sub}>#️⃣ Qty: {job.qty}</div>}

              {job.notes && <div style={notes}>📝 {job.notes}</div>}
            </div>
          ))
        )}
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
};

const heroTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
};

const title: React.CSSProperties = {
  fontSize: 30,
  margin: 0,
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#4b5563",
};

const empty: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "white",
  border: "1px dashed #d1d5db",
};

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 14,
  padding: 14,
  marginBottom: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const cardActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
};

const customer: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
};

const sub: React.CSSProperties = {
  fontSize: 13,
  marginTop: 4,
};

const notes: React.CSSProperties = {
  fontSize: 13,
  marginTop: 8,
  background: "#f9fafb",
  padding: 8,
  borderRadius: 8,
};

const editBtn: React.CSSProperties = {
  padding: "8px 12px",
  background: "#111827",
  color: "white",
  borderRadius: 8,
  border: "none",
};

const reopenBtn: React.CSSProperties = {
  padding: "8px 12px",
  background: "#f59e0b",
  color: "white",
  borderRadius: 8,
  border: "none",
};