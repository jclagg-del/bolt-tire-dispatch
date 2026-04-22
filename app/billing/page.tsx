"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";

type BillingJob = {
  id: string | number;
  customer?: string | null;
  unit_number?: string | null;
  vehicle?: string | null;
  scheduled?: string | Date | null;
  job_total?: number | string | null;
  payment_status?: string | null;
  invoice_number?: string | null;
  job_status?: string | null;
  billing_name?: string | null;
  complete?: boolean | null;
};

const NY_TIMEZONE = "America/New_York";

function parseJobDate(input?: string | Date | null) {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

  const value = input.trim();
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatScheduled(input?: string | Date | null) {
  const date = parseJobDate(input);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value?: number | string | null) {
  if (!value && value !== 0) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return `$${num.toFixed(2)}`;
}

export default function BillingPage() {
  const [jobs, setJobs] = useState<BillingJob[]>([]);
  const [payingId, setPayingId] = useState<string | number | null>(null);

  const fetchJobs = async () => {
    const { data, error } = await supabase.from("jobs").select("*");

    if (error) {
      alert(`Error loading billing jobs: ${error.message}`);
      return;
    }

    setJobs(data || []);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleMarkPaid = async (id: string | number) => {
    if (payingId) return;

    setPayingId(id);

    const { error } = await supabase
      .from("jobs")
      .update({
        payment_status: "paid",
        job_status: "paid",
      })
      .eq("id", id);

    setPayingId(null);

    if (error) {
      alert(`Error marking job paid: ${error.message}`);
      return;
    }

    await fetchJobs();
  };

  const readyToBill = jobs.filter(
    (j) => j.complete && !j.invoice_number && j.payment_status !== "paid"
  );

  const billedUnpaid = jobs.filter(
    (j) => j.invoice_number && j.payment_status !== "paid"
  );

  const paidJobs = jobs.filter((j) => j.payment_status === "paid");

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={headerWrap}>
          <div style={eyebrow}>Billing</div>
          <h1 style={title}>Billing</h1>
          <p style={description}>
            Track jobs that are ready to bill, already billed, and fully paid.
          </p>
        </div>

        <div style={summaryRow}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Ready to Bill</div>
            <div style={summaryValue}>{readyToBill.length}</div>
          </div>

          <div style={summaryCard}>
            <div style={summaryLabel}>Billed / Unpaid</div>
            <div style={summaryValue}>{billedUnpaid.length}</div>
          </div>

          <div style={summaryCard}>
            <div style={summaryLabel}>Paid</div>
            <div style={summaryValue}>{paidJobs.length}</div>
          </div>
        </div>

        {[
          { title: "Ready to bill", jobs: readyToBill },
          { title: "Billed, unpaid", jobs: billedUnpaid },
          { title: "Paid", jobs: paidJobs },
        ].map((section) => (
          <div key={section.title} style={sectionCard}>
            <div style={sectionHeader}>
              <h2 style={sectionTitle}>
                {section.title} ({section.jobs.length})
              </h2>
            </div>

            {section.jobs.length === 0 ? (
              <div style={emptyState}>No jobs in this section.</div>
            ) : (
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Customer</th>
                    <th style={th}>Vehicle</th>
                    <th style={th}>Scheduled</th>
                    <th style={th}>Total</th>
                    <th style={th}>Payment</th>
                    <th style={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {section.jobs.map((job) => {
                    const isPaid = job.payment_status === "paid";
                    const isUpdating = payingId === job.id;

                    return (
                      <tr key={job.id}>
                        <td style={td}>{job.customer || "—"}</td>
                        <td style={td}>
                          {job.unit_number || job.vehicle || "—"}
                        </td>
                        <td style={td}>{formatScheduled(job.scheduled)}</td>
                        <td style={tdStrong}>{formatMoney(job.job_total)}</td>

                        <td style={td}>
                          <span
                            style={{
                              ...statusPill,
                              ...(isPaid ? paidPill : unpaidPill),
                            }}
                          >
                            {job.payment_status || "unpaid"}
                          </span>
                        </td>

                        <td style={td}>
                          {isPaid ? (
                            <span style={paidText}>Paid</span>
                          ) : (
                            <button
                              onClick={() => handleMarkPaid(job.id)}
                              style={payButton}
                              disabled={isUpdating}
                            >
                              {isUpdating ? "Updating..." : "Mark Paid"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* styles */

const shell: React.CSSProperties = {
  background: "#f8fafc",
  minHeight: "100vh",
};

const page: React.CSSProperties = {
  padding: 20,
  maxWidth: 1200,
  margin: "0 auto",
};

const headerWrap: React.CSSProperties = {
  marginBottom: 16,
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
};

const title: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
};

const description: React.CSSProperties = {
  color: "#4b5563",
};

const summaryRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const summaryCard: React.CSSProperties = {
  background: "white",
  padding: 14,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
};

const summaryLabel: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
};

const summaryValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
};

const sectionCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  marginBottom: 16,
};

const sectionHeader: React.CSSProperties = {
  padding: 16,
  borderBottom: "1px solid #e5e7eb",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
};

const emptyState: React.CSSProperties = {
  padding: 16,
  color: "#6b7280",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  padding: 12,
  textAlign: "left",
};

const td: React.CSSProperties = {
  padding: 12,
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 700,
};

const statusPill: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const paidPill: React.CSSProperties = {
  background: "#dcfce7",
  color: "#166534",
};

const unpaidPill: React.CSSProperties = {
  background: "#fee2e2",
  color: "#991b1b",
};

const payButton: React.CSSProperties = {
  padding: "8px 12px",
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
};

const paidText: React.CSSProperties = {
  color: "#166534",
  fontWeight: 700,
};