"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import BillingReceiptDialog from "@/components/BillingReceiptDialog";
import CompletionTextButton from "@/components/CompletionTextButton";
import { matchesBillingSearch } from "@/lib/billing-search";
import QuickBooksInvoicePreview, { QuickBooksInvoice } from "@/components/QuickBooksInvoicePreview";

type BillingJob = {
  id: string | number;
  customer?: string | null;
  contact_name?: string | null;
  facility_name?: string | null;
  po_number?: string | null;
  mo_number?: string | null;
  email?: string | null;
  address?: string | null;
  license_plate?: string | null;
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
  phone?: string | null;
  contact_number?: string | null;
  review_request_sent_at?: string | null;
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
  const [search, setSearch] = useState("");
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [receiptJobId, setReceiptJobId] = useState<string | number | null>(null);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [checkingQuickBooks, setCheckingQuickBooks] = useState(false);
  const [quickBooksError, setQuickBooksError] = useState("");
  const [quickBooksCompany, setQuickBooksCompany] = useState("");
  const [quickBooksChecks, setQuickBooksChecks] = useState<{ name: string; ok: boolean; error?: string }[]>([]);
  const [installationChoice, setInstallationChoice] = useState<{ jobId: string | number; items: { id: string; name: string }[] } | null>(null);
  const [installationItemId, setInstallationItemId] = useState("");
  const [invoicePreview, setInvoicePreview] = useState<QuickBooksInvoice | null>(null);
  const [readingInvoiceId, setReadingInvoiceId] = useState<string | number | null>(null);

  const fetchJobs = async () => {
    setLoadingJobs(true); setJobsError("");
    try {
      const allJobs: BillingJob[] = [];
      // Load every page so searching doesn't silently omit older paid jobs.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("jobs").select("*").order("id").range(offset, offset + 499);
        if (error) throw new Error(error.message);
        allJobs.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      setJobs(allJobs);
    } catch (error) {
      setJobsError(error instanceof Error ? error.message : "Could not load billing jobs.");
    } finally {
      setLoadingJobs(false);
    }
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

  const checkQuickBooks = async (fullTest = false) => {
    setCheckingQuickBooks(true); setQuickBooksError(""); setQuickBooksChecks([]);
    try {
      const response = await authenticatedFetch(`/api/quickbooks/status${fullTest ? "?test=1" : ""}`);
      const data = await response.json();
      setQuickBooksConnected(Boolean(response.ok && data.connected));
      setQuickBooksEnvironment(data.environment || "");
      setQuickBooksCompany(data.companyName || "");
      if (!response.ok || !data.connected) throw new Error(data.error || "QuickBooks connection could not be verified.");
      if (fullTest) setQuickBooksChecks(data.checks || []);
    } catch (error) {
      setQuickBooksConnected(false);
      setQuickBooksError(error instanceof Error ? error.message : "QuickBooks connection could not be verified.");
    } finally { setCheckingQuickBooks(false); }
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

  const viewInvoice = async (id: string | number) => {
    setReadingInvoiceId(id);
    try {
      const response = await authenticatedFetch(`/api/quickbooks/invoices?jobId=${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read QuickBooks invoice.");
      setInvoicePreview(data.invoice);
    } catch (error) { alert(error instanceof Error ? error.message : "Could not read invoice."); }
    finally { setReadingInvoiceId(null); }
  };

  const createInvoice = async (id: string | number, selectedInstallationItemId?: string) => {
    setInvoicingId(id);
    try {
    const response = await authenticatedFetch("/api/quickbooks/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: id, ...(selectedInstallationItemId ? { installationItemId: selectedInstallationItemId } : {}) }),
    });
    const data = await response.json();
    if (data.code === "INSTALLATION_ITEM_REQUIRED") {
      setInstallationItemId(""); setInstallationChoice({ jobId: id, items: data.installationItems }); return;
    }
    if (!response.ok) return alert(data.error || "Invoice creation failed.");
    await fetchJobs();
    setInstallationChoice(null);
    await viewInvoice(id);
    } catch { alert("Could not confirm invoice creation. Refresh Billing and check QuickBooks before retrying to avoid a duplicate."); }
    finally { setInvoicingId(null); }
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

  const readyToBill = jobs.filter((job) => {
    const status = job.job_status || (job.complete ? "completed" : "scheduled");
    return job.complete && !["billed", "paid"].includes(status) && job.payment_status !== "paid";
  });

  const billedUnpaid = jobs.filter((job) =>
    job.job_status === "billed" && job.payment_status !== "paid"
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

        {receiptMessage && <p role="status" style={{ padding: 14, background: "#ecfdf5", border: "1px solid #86efac", borderRadius: 10 }}>{receiptMessage}</p>}
        <div style={quickBooksConnected ? connectedCard : connectCard}>
          <div>
            <strong>{checkingQuickBooks ? "Checking QuickBooks…" : quickBooksConnected ? "QuickBooks connected" : "QuickBooks connection not verified"}</strong>
            <div style={connectionHelp}>
              {quickBooksConnected
                ? `Connected to ${quickBooksEnvironment === "production" ? "REAL QuickBooks (Production)" : "QuickBooks Sandbox"}${quickBooksCompany ? ` — ${quickBooksCompany}` : ""}.`
                : "Connect your QuickBooks Online company to create invoices and sync payments."}
            </div>
          </div>
          <button type="button" onClick={() => checkQuickBooks(true)} disabled={checkingQuickBooks || syncing || connecting || disconnecting} style={quickBooksButton}>
            {checkingQuickBooks ? "Testing…" : "Test connection"}
          </button>
          {!quickBooksConnected && (
            <button type="button" onClick={connectQuickBooks} disabled={connecting || checkingQuickBooks} style={quickBooksButton}>
              {connecting ? "Connecting..." : "Connect to QuickBooks"}
            </button>
          )}
          {quickBooksConnected && (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={syncQuickBooks} disabled={syncing || checkingQuickBooks || disconnecting} style={quickBooksButton}>
                {syncing ? "Syncing..." : "Sync payments"}
              </button>
              <button type="button" onClick={disconnectQuickBooks} disabled={disconnecting || checkingQuickBooks || syncing} style={disconnectButton}>
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          )}
        </div>

        {quickBooksError && <p role="alert" style={{ padding: 14, background: "#fef2f2", color: "#991b1b", borderRadius: 10 }}>{quickBooksError} No invoices or payments were changed by this check.</p>}
        {quickBooksChecks.length > 0 && <div role="status" style={{ padding: 16, marginBottom: 16, background: "white", border: "1px solid #cbd5e1", borderRadius: 12 }}>
          <strong>{quickBooksChecks.every(check => check.ok) ? "QuickBooks connection tests passed" : "QuickBooks needs attention"}</strong>
          <ul>{quickBooksChecks.map(check => <li key={check.name}>{check.ok ? "✓" : "✕"} {check.name}{check.error ? `: ${check.error}` : ""}</li>)}</ul>
          <p style={{ marginBottom: 0 }}>Read-only test. No invoices were created and no payment balances were changed. Creating invoices and syncing payments are separate actions.</p>
        </div>}

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

        <div style={{ ...sectionCard, padding: 16 }}>
          <label htmlFor="billing-search" style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Search billing</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="billing-search" type="search" value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Name, job / PO, MO, invoice, vehicle, phone or email…"
              style={{ flex: 1, minWidth: 0, minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 9, padding: "10px 12px", fontSize: 16 }} />
            {search && <button type="button" onClick={() => setSearch("")} style={linkButton}>Clear</button>}
          </div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 0 }}>Searches Ready to bill, Billed / unpaid and Paid. Summary totals stay unchanged.</p>
          {loadingJobs && <p role="status">Loading billing jobs…</p>}
          {jobsError && <p role="alert">Could not refresh billing: {jobsError} <button type="button" onClick={fetchJobs} disabled={loadingJobs}>Retry</button></p>}
        </div>

        {[
          { title: "Ready to bill", jobs: readyToBill, paidSection: false },
          { title: "Billed, unpaid", jobs: billedUnpaid, paidSection: false, amount: billedUnpaidTotal },
          { title: "Paid", jobs: paidJobs, paidSection: true },
        ].map(section => ({ ...section, totalCount: section.jobs.length, jobs: section.jobs.filter(job => matchesBillingSearch(job, search)) })).map((section) => (
          <div key={section.title} style={sectionCard}>
            <div style={sectionHeader}>
              <h2 style={sectionTitle}>
                {section.title} ({section.jobs.length}{search.trim() ? ` of ${section.totalCount}` : ""})
              </h2>
              {section.amount !== undefined && (
                <strong style={sectionAmount}>{formatMoney(section.amount)} outstanding{search.trim() ? " (all jobs)" : ""}</strong>
              )}
            </div>

            {section.jobs.length === 0 ? (
              <div style={emptyState}>{loadingJobs ? "Loading…" : jobsError && !jobs.length ? "Billing could not be loaded. Please retry." : search.trim() ? "No matching jobs in this section." : "No jobs in this section."}</div>
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
                        <td style={td}>{job.customer || "—"}
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Job / PO: {job.po_number || job.id}{job.mo_number ? ` · MO: ${job.mo_number}` : ""}</div>
                        </td>
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
                          <div style={actionButtons}>
                          {job.quickbooks_invoice_id && <button type="button" style={linkButton} disabled={readingInvoiceId === job.id} onClick={event => { event.stopPropagation(); viewInvoice(job.id); }}>{readingInvoiceId === job.id ? "Loading invoice…" : "View QuickBooks invoice"}</button>}
                          {isPaid && <button type="button" style={{ ...invoiceButton, minHeight: 44 }} onClick={event => { event.stopPropagation(); setReceiptMessage(""); setReceiptJobId(job.id); }}>Send receipt</button>}
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
                            <>
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
                            </>
                          )}
                          <CompletionTextButton key={String(job.id)} job={job} />
                          </div>
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
      {receiptJobId !== null && <BillingReceiptDialog key={String(receiptJobId)} jobId={receiptJobId} onClose={() => setReceiptJobId(null)}
        onSent={email => { setReceiptJobId(null); setReceiptMessage(`Receipt sent to ${email}.`); }} />}
      {invoicePreview && <QuickBooksInvoicePreview invoice={invoicePreview} onClose={() => setInvoicePreview(null)} />}
      {installationChoice && <div role="dialog" aria-modal="true" aria-label="Choose installation service" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#0f172a88", padding: 20, display: "grid", placeItems: "center" }}><section style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 640 }}>
        <h2>Choose installation service</h2><p>This job has no matching default installation item. Choose the existing QuickBooks service. The job’s installation price stays unchanged.</p>
        <label htmlFor="qb-installation">QuickBooks installation service</label>
        <select id="qb-installation" value={installationItemId} disabled={invoicingId !== null} onChange={event => setInstallationItemId(event.target.value)} style={{ display: "block", width: "100%", padding: 12, margin: "12px 0" }}><option value="">Choose a service…</option>{installationChoice.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <button type="button" disabled={invoicingId !== null} onClick={() => setInstallationChoice(null)} style={disconnectButton}>Cancel</button>{" "}
        <button type="button" disabled={!installationItemId || invoicingId !== null} onClick={() => createInvoice(installationChoice.jobId, installationItemId)} style={invoiceButton}>{invoicingId !== null ? "Creating…" : "Create invoice with this service"}</button>
      </section></div>}
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
