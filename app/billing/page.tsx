"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  quickbooks_invoice_id?: string | null;
  job_status?: string | null;
  billing_name?: string | null;
  complete?: boolean | null;
  paid_date?: string | Date | null;
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
  const router = useRouter();

  const [jobs, setJobs] = useState<BillingJob[]>([]);
  const [payingId, setPayingId] = useState<string | number | null>(null);
  const [quickBooksConnected, setQuickBooksConnected] = useState(false);
  const [quickBooksEnvironment, setQuickBooksEnvironment] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [invoicingId, setInvoicingId] = useState<string | number | null>(null);
  const [numberingId, setNumberingId] = useState<string | number | null>(null);
  const [linkingId, setLinkingId] = useState<string | number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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
    checkQuickBooks();
  }, []);

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    return fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${data.session?.access_token || ""}` },
    });
  };

  const checkQuickBooks = async () => {
    const response = await authenticatedFetch("/api/quickbooks/status");
    const data = await response.json();
    setQuickBooksConnected(Boolean(data.connected));
    setQuickBooksEnvironment(data.environment || "");
  };

  const connectQuickBooks = async () => {
    setConnecting(true);
    const response = await authenticatedFetch("/api/quickbooks/connect", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "Could not start the QuickBooks connection.");
      setConnecting(false);
      return;
    }
    window.location.href = data.url;
  };

  const createInvoice = async (id: string | number) => {
    setInvoicingId(id);
    const response = await authenticatedFetch("/api/quickbooks/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: id }),
    });
    const data = await response.json();
    setInvoicingId(null);
    if (!response.ok) return alert(data.error || "Invoice creation failed.");
    await fetchJobs();
    alert(`QuickBooks invoice ${data.invoice.DocNumber || data.invoice.Id} created.`);
  };

  const syncQuickBooks = async () => {
    setSyncing(true);
    const response = await authenticatedFetch("/api/quickbooks/sync", { method: "POST" });
    const data = await response.json();
    setSyncing(false);
    if (!response.ok) return alert(data.error || "QuickBooks sync failed.");
    await fetchJobs();
  };

  const setInvoiceNumber = async (job: BillingJob) => {
    const docNumber = window.prompt("Enter the QuickBooks invoice number for this invoice:", "5434");
    if (!docNumber) return;
    setNumberingId(job.id);
    const response = await authenticatedFetch("/api/quickbooks/invoices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, docNumber }),
    });
    const data = await response.json();
    setNumberingId(null);
    if (!response.ok) return alert(data.error || "Invoice number update failed.");
    await fetchJobs();
    alert(`QuickBooks invoice number set to ${data.invoice.DocNumber}.`);
  };

  const linkExistingInvoice = async (job: BillingJob) => {
    const docNumber = window.prompt("Enter the existing QuickBooks invoice number to link to this job:");
    if (!docNumber) return;
    if (!window.confirm(`Link this job to QuickBooks invoice ${docNumber}? Payment syncing will follow that invoice.`)) return;
    setLinkingId(job.id);
    const response = await authenticatedFetch("/api/quickbooks/invoices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, docNumber }),
    });
    const data = await response.json();
    setLinkingId(null);
    if (!response.ok) return alert(data.error || "Invoice relinking failed.");
    await fetchJobs();
    alert(`Job linked to QuickBooks invoice ${data.invoice.DocNumber}.`);
  };

  const disconnectQuickBooks = async () => {
    if (!window.confirm("Disconnect Bolt Tire Dispatch from QuickBooks? Invoice synchronization will stop until you reconnect.")) return;
    setDisconnecting(true);
    const response = await authenticatedFetch("/api/quickbooks/disconnect", { method: "POST" });
    const data = await response.json();
    setDisconnecting(false);
    if (!response.ok) return alert(data.error || "QuickBooks disconnect failed.");
    setQuickBooksConnected(false);
  };

  const handleMarkPaid = async (id: string | number) => {
    if (payingId) return;

    setPayingId(id);

    const { error } = await supabase
      .from("jobs")
      .update({
        payment_status: "paid",
        job_status: "paid",
        paid_date: new Date().toISOString(),
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

  const paidJobs = jobs
    .filter((j) => j.payment_status === "paid")
    .sort((a, b) => {
      const aDate = parseJobDate(a.paid_date) || parseJobDate(a.scheduled);
      const bDate = parseJobDate(b.paid_date) || parseJobDate(b.scheduled);
      return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
    });
  const billedUnpaidTotal = billedUnpaid.reduce(
    (sum, job) => sum + (Number(job.job_total) || 0),
    0
  );

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

        <div style={quickBooksConnected ? connectedCard : connectCard}>
          <div>
            <strong>{quickBooksConnected ? "QuickBooks connected" : "Connect QuickBooks Online"}</strong>
            <div style={connectionHelp}>
              {quickBooksConnected
                ? `Connected to ${quickBooksEnvironment === "production" ? "REAL QuickBooks (Production)" : "QuickBooks Sandbox"}.`
                : "Connect your QuickBooks Online company to create invoices and sync payments."}
            </div>
          </div>
          {!quickBooksConnected && (
            <button type="button" onClick={connectQuickBooks} disabled={connecting} style={quickBooksButton}>
              {connecting ? "Connecting..." : "Connect to QuickBooks"}
            </button>
          )}
          {quickBooksConnected && (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={syncQuickBooks} disabled={syncing} style={quickBooksButton}>
                {syncing ? "Syncing..." : "Sync payments"}
              </button>
              <button type="button" onClick={disconnectQuickBooks} disabled={disconnecting} style={disconnectButton}>
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          )}
        </div>

        <div style={summaryRow}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Ready to Bill</div>
            <div style={summaryValue}>{readyToBill.length}</div>
          </div>

          <div style={summaryCard}>
            <div style={summaryLabel}>Billed / Unpaid</div>
            <div style={summaryValue}>{billedUnpaid.length}</div>
            <div style={summaryAmount}>{formatMoney(billedUnpaidTotal)}</div>
          </div>

          <div style={summaryCard}>
            <div style={summaryLabel}>Paid</div>
            <div style={summaryValue}>{paidJobs.length}</div>
          </div>
        </div>

        {[
          { title: "Ready to bill", jobs: readyToBill, paidSection: false },
          { title: "Billed, unpaid", jobs: billedUnpaid, paidSection: false, amount: billedUnpaidTotal },
          { title: "Paid", jobs: paidJobs, paidSection: true },
        ].map((section) => (
          <div key={section.title} style={sectionCard}>
            <div style={sectionHeader}>
              <h2 style={sectionTitle}>
                {section.title} ({section.jobs.length})
              </h2>
              {section.amount !== undefined && (
                <strong style={sectionAmount}>{formatMoney(section.amount)} outstanding</strong>
              )}
            </div>

            {section.jobs.length === 0 ? (
              <div style={emptyState}>No jobs in this section.</div>
            ) : (
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Customer</th>
                    <th style={th}>Vehicle</th>
                    <th style={th}>{section.paidSection ? "Date Paid" : "Scheduled"}</th>
                    <th style={th}>Invoice #</th>
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
                      <tr
                        key={job.id}
                        onClick={() => router.push(`/jobs/${job.id}`)}
                        style={clickableRow}
                      >
                        <td style={td}>{job.customer || "—"}</td>
                        <td style={td}>
                          {job.unit_number || job.vehicle || "—"}
                        </td>
                        <td style={td}>{formatScheduled(section.paidSection ? job.paid_date || job.scheduled : job.scheduled)}</td>
                        <td style={tdStrong}>{job.invoice_number || "—"}</td>
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
                          {!job.invoice_number && quickBooksConnected ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); createInvoice(job.id); }}
                              style={invoiceButton}
                              disabled={invoicingId === job.id}
                            >
                              {invoicingId === job.id ? "Creating..." : "Create invoice"}
                            </button>
                          ) : isPaid ? (
                            <span style={paidText}>Paid</span>
                          ) : (
                            <div style={actionButtons}>
                              {job.quickbooks_invoice_id && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setInvoiceNumber(job); }}
                                    style={numberButton}
                                    disabled={numberingId === job.id}
                                  >
                                    {numberingId === job.id ? "Updating..." : "Set Invoice #"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); linkExistingInvoice(job); }}
                                    style={linkButton}
                                    disabled={linkingId === job.id}
                                  >
                                    {linkingId === job.id ? "Linking..." : "Link Existing"}
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkPaid(job.id);
                                }}
                                style={payButton}
                                disabled={isUpdating}
                              >
                                {isUpdating ? "Updating..." : "Mark Paid"}
                              </button>
                            </div>
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

const connectCard: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", padding: 16, marginBottom: 18, borderRadius: 12, border: "1px solid #93c5fd", background: "#eff6ff" };
const connectedCard: React.CSSProperties = { ...connectCard, border: "1px solid #86efac", background: "#f0fdf4" };
const connectionHelp: React.CSSProperties = { marginTop: 4, color: "#4b5563", fontSize: 14 };
const quickBooksButton: React.CSSProperties = { padding: "10px 14px", border: 0, borderRadius: 8, background: "#2ca01c", color: "white", fontWeight: 800, cursor: "pointer" };
const invoiceButton: React.CSSProperties = { ...quickBooksButton, background: "#2563eb", padding: "8px 12px" };
const numberButton: React.CSSProperties = { ...quickBooksButton, background: "#7c3aed", padding: "8px 12px" };
const linkButton: React.CSSProperties = { ...quickBooksButton, background: "#0369a1", padding: "8px 12px" };
const actionButtons: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const disconnectButton: React.CSSProperties = { ...quickBooksButton, background: "#6b7280" };

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

const summaryAmount: React.CSSProperties = {
  marginTop: 4,
  color: "#b45309",
  fontSize: 14,
  fontWeight: 800,
};

const sectionCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  marginBottom: 16,
  overflow: "hidden",
};

const sectionHeader: React.CSSProperties = {
  padding: 16,
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
};

const sectionAmount: React.CSSProperties = {
  color: "#b45309",
  fontSize: 16,
};

const emptyState: React.CSSProperties = {
  padding: 16,
  color: "#6b7280",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const th: React.CSSProperties = {
  padding: 12,
  textAlign: "left" as const,
};

const clickableRow: React.CSSProperties = {
  cursor: "pointer",
};

const td: React.CSSProperties = {
  padding: 12,
  borderTop: "1px solid #f1f5f9",
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
  cursor: "pointer",
};

const paidText: React.CSSProperties = {
  color: "#166534",
  fontWeight: 700,
};
