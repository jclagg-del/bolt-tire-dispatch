"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string | number;
  customer: string | null;
  vehicle: string | null;
  unit_number: string | null;
  vehicle_id: string | null;
  scheduled: string | null;
  service_type: string | null;
  po_number: string | null;
  notes: string | null;
  job_status: string | null;
  customer_order_status: string | null;
  payment_status: string | null;
  submitted_by: string | null;
  estimated_delivery_date: string | null;
  complete: boolean | null;
  archived: boolean | null;
};

const TASK_TYPES = [
  "Brake Service",
  "Oil Change",
  "Air Filter Service",
  "Parts Replacement",
  "Axle / Driveline",
  "Diagnostics",
  "General Service",
];
const APPROVAL_STATUSES = ["Request Received", "Needs Info to Submit", "Ready to Submit", "Awaiting Approval", "Approved", "Work Completed", "Declined", "Cancelled"];

function formatAppointment(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [approvalView, setApprovalView] = useState("all");
  const [workingId, setWorkingId] = useState<string | number | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id,customer,vehicle,unit_number,vehicle_id,scheduled,service_type,po_number,notes,job_status,customer_order_status,payment_status,submitted_by,estimated_delivery_date,complete,archived")
        .in("service_type", TASK_TYPES)
        .order("scheduled", { ascending: true, nullsFirst: false });
      if (!error) setTasks((data as Task[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const taskStatus = task.job_status || (task.complete ? "completed" : "scheduled");
      if (status === "archived" && !task.archived) return false;
      if (status !== "archived" && task.archived) return false;
      if (status === "open" && (task.complete || ["completed", "billed", "paid"].includes(taskStatus))) return false;
      if (status === "completed" && !task.complete && !["completed", "billed", "paid"].includes(taskStatus)) return false;
      const approval = task.customer_order_status || "Request Received";
      if (approvalView === "needs_submission" && !["Request Received", "Needs Info to Submit", "Ready to Submit"].includes(approval)) return false;
      if (approvalView === "pending" && approval !== "Awaiting Approval") return false;
      if (approvalView === "approved" && approval !== "Approved") return false;
      if (query && ![task.customer, task.vehicle, task.unit_number, task.service_type, task.po_number, task.notes].filter(Boolean).join(" ").toLowerCase().includes(query)) return false;
      return true;
    });
  }, [tasks, search, status, approvalView]);

  const approvalCounts = useMemo(() => ({
    needsSubmission: tasks.filter((task) => !task.archived && !task.complete && ["Request Received", "Needs Info to Submit", "Ready to Submit"].includes(task.customer_order_status || "Request Received")).length,
    pending: tasks.filter((task) => !task.archived && !task.complete && task.customer_order_status === "Awaiting Approval").length,
    approved: tasks.filter((task) => !task.archived && !task.complete && task.customer_order_status === "Approved").length,
  }), [tasks]);

  const approvalTone = (task: Task) => {
    const approval = task.customer_order_status || "Request Received";
    if (["Request Received", "Needs Info to Submit", "Ready to Submit"].includes(approval)) return { color: "#b45309", background: "#fef3c7", border: "#f59e0b" };
    if (approval === "Awaiting Approval") return { color: "#1d4ed8", background: "#dbeafe", border: "#3b82f6" };
    if (approval === "Approved") return { color: "#166534", background: "#dcfce7", border: "#22c55e" };
    if (["Declined", "Cancelled"].includes(approval)) return { color: "#991b1b", background: "#fee2e2", border: "#ef4444" };
    return { color: "#475569", background: "#e2e8f0", border: "#94a3b8" };
  };

  const markCompleted = async (task: Task) => {
    if (workingId !== null) return;
    if (!window.confirm(`Mark ${task.customer || "this task"} as completed?`)) return;
    setWorkingId(task.id);
    const completedAt = new Date().toISOString();
    const { error } = await supabase
      .from("jobs")
      .update({ complete: true, job_status: "completed", customer_order_status: "Work Completed", completed_at: completedAt })
      .eq("id", task.id);
    setWorkingId(null);
    if (error) return window.alert(`Unable to complete task: ${error.message}`);
    setTasks((current) => current.map((item) => item.id === task.id
      ? { ...item, complete: true, job_status: "completed", customer_order_status: "Work Completed" }
      : item));
  };

  const updateTask = async (task: Task, updates: Partial<Task>) => {
    if (workingId !== null) return;
    setWorkingId(task.id);
    const { error } = await supabase.from("jobs").update(updates).eq("id", task.id);
    setWorkingId(null);
    if (error) return window.alert(`Unable to update task: ${error.message}`);
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...updates } : item));
  };

  const invoiceEmailed = (task: Task) => /(?:^|\n)Invoice emailed: Yes(?:\n|$)/i.test(task.notes || "");
  const visibleNotes = (task: Task) => (task.notes || "").replace(/(?:^|\n)Invoice emailed: Yes(?=\n|$)/gi, "").trim();
  const setInvoiceEmailed = (task: Task, checked: boolean) => {
    const cleaned = (task.notes || "").replace(/(?:^|\n)Invoice emailed: Yes(?=\n|$)/gi, "").trim();
    const notes = [cleaned, checked ? "Invoice emailed: Yes" : ""].filter(Boolean).join("\n");
    updateTask(task, { notes });
  };

  const setArchived = async (task: Task, archived: boolean) => {
    if (archived && !window.confirm("Archive this task? You can restore it from Archived Tasks.")) return;
    await updateTask(task, { archived });
  };

  return (
    <div style={shell}>
      <AppHeader />
      <main style={page}>
        <section style={hero}>
          <div>
            <div style={eyebrow}>Service Work</div>
            <h1 style={title}>Tasks</h1>
            <p style={subtitle}>Track non-tire work and reserve the assigned vehicle and technician on the schedule.</p>
          </div>
          <button type="button" style={primaryButton} onClick={() => router.push("/tasks/new")}>+ Add Task</button>
        </section>

        <section style={filters}>
          <input style={input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, vehicle, task, RO or notes..." />
          <select style={select} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="open">Open tasks</option>
            <option value="completed">Completed tasks</option>
            <option value="archived">Archived tasks</option>
            <option value="all">All tasks</option>
          </select>
        </section>

        <section style={approvalSummary}>
          <button type="button" onClick={() => setApprovalView(approvalView === "needs_submission" ? "all" : "needs_submission")} style={{ ...summaryButton, ...needsSummary, ...(approvalView === "needs_submission" ? activeSummary : {}) }}>
            <strong>{approvalCounts.needsSubmission}</strong><span>Needs Submission</span>
          </button>
          <button type="button" onClick={() => setApprovalView(approvalView === "pending" ? "all" : "pending")} style={{ ...summaryButton, ...pendingSummary, ...(approvalView === "pending" ? activeSummary : {}) }}>
            <strong>{approvalCounts.pending}</strong><span>Pending Approval</span>
          </button>
          <button type="button" onClick={() => setApprovalView(approvalView === "approved" ? "all" : "approved")} style={{ ...summaryButton, ...approvedSummary, ...(approvalView === "approved" ? activeSummary : {}) }}>
            <strong>{approvalCounts.approved}</strong><span>Approved</span>
          </button>
        </section>

        {loading ? <div style={empty}>Loading tasks...</div> : visibleTasks.length === 0 ? (
          <div style={empty}>No tasks match this view.</div>
        ) : (
          <div style={grid}>
            {visibleTasks.map((task) => (
              <article
                key={task.id}
                style={{ ...card, borderLeft: `6px solid ${approvalTone(task).border}` }}
                onClick={() => router.push(`/jobs/${task.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") router.push(`/jobs/${task.id}`);
                }}
              >
                <div style={cardTop}>
                  <div>
                    <span style={typeBadge}>{task.service_type}</span>
                    <h2 style={customer}>{task.customer || "Task"}</h2>
                  </div>
                  <span style={{ ...statusBadge, color: approvalTone(task).color, background: approvalTone(task).background }}>
                    {task.customer_order_status || "Request Received"}
                  </span>
                </div>
                <strong style={appointment}>{formatAppointment(task.scheduled)}</strong>
                <div style={details}>
                  <span><small>VEHICLE NUMBER</small>{task.unit_number || "—"}</span>
                  <span><small>YEAR / MAKE / MODEL</small>{task.vehicle || "—"}</span>
                  <span><small>RO / PO</small>{task.po_number || "—"}</span>
                </div>
                <div style={workflowGrid} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <label style={workflowField}>Approval Status
                    <select style={workflowInput} value={task.customer_order_status || "Request Received"} disabled={workingId === task.id} onChange={(event) => updateTask(task, { customer_order_status: event.target.value })}>
                      {APPROVAL_STATUSES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label style={workflowField}>Billing Customer
                    <select style={workflowInput} value={task.submitted_by || ""} disabled={workingId === task.id} onChange={(event) => updateTask(task, { submitted_by: event.target.value })}>
                      <option value="">Select</option><option>Element</option><option>LeasePlan</option><option>Merchant</option><option>Other</option>
                    </select>
                  </label>
                  <label style={workflowField}>Expected Completion
                    <input type="date" style={workflowInput} value={task.estimated_delivery_date || ""} disabled={workingId === task.id} onChange={(event) => updateTask(task, { estimated_delivery_date: event.target.value })} />
                  </label>
                  <label style={workflowField}>Billing Status
                    <select style={workflowInput} value={task.payment_status || "not_yet_billed"} disabled={workingId === task.id} onChange={(event) => updateTask(task, { payment_status: event.target.value })}>
                      <option value="not_yet_billed">Not Yet Billed</option><option value="estimate_sent">Estimate Sent</option><option value="billed">Billed</option><option value="canceled">Cancelled</option><option value="paid">Paid</option>
                    </select>
                  </label>
                </div>
                <div style={checkRow} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <label><input type="checkbox" checked={task.payment_status === "paid"} disabled={workingId === task.id} onChange={(event) => updateTask(task, { payment_status: event.target.checked ? "paid" : "billed" })} /> Paid</label>
                  <label><input type="checkbox" checked={invoiceEmailed(task)} disabled={workingId === task.id} onChange={(event) => setInvoiceEmailed(task, event.target.checked)} /> Invoice Emailed</label>
                </div>
                {visibleNotes(task) ? <p style={notes}>{visibleNotes(task)}</p> : null}
                {!task.complete && !["completed", "billed", "paid"].includes(task.job_status || "") ? (
                  <button
                    type="button"
                    style={completeButton}
                    disabled={workingId === task.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      markCompleted(task);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {workingId === task.id ? "Completing..." : "✓ Mark Completed"}
                  </button>
                ) : null}
                <div style={taskActions} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <button type="button" style={archiveButton} disabled={workingId === task.id} onClick={() => setArchived(task, !task.archived)}>
                    {task.archived ? "Restore Task" : "Archive Task"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const shell: React.CSSProperties = { minHeight: "100vh", background: "#f8fafc" };
const page: React.CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: 20 };
const hero: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 22, background: "white", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 3px 12px rgba(15,23,42,.06)" };
const eyebrow: React.CSSProperties = { color: "#2563eb", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" };
const title: React.CSSProperties = { margin: "4px 0", color: "#0f172a", fontSize: 34 };
const subtitle: React.CSSProperties = { margin: 0, color: "#64748b" };
const primaryButton: React.CSSProperties = { padding: "12px 16px", border: 0, borderRadius: 10, background: "#2563eb", color: "white", fontWeight: 800, cursor: "pointer" };
const filters: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 180px", gap: 10, margin: "18px 0" };
const approvalSummary: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 };
const summaryButton: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 800 };
const needsSummary: React.CSSProperties = { border: "1px solid #f59e0b", background: "#fffbeb", color: "#92400e" };
const pendingSummary: React.CSSProperties = { border: "1px solid #3b82f6", background: "#eff6ff", color: "#1e40af" };
const approvedSummary: React.CSSProperties = { border: "1px solid #22c55e", background: "#f0fdf4", color: "#166534" };
const activeSummary: React.CSSProperties = { boxShadow: "0 0 0 3px rgba(37,99,235,.18)", transform: "translateY(-1px)" };
const input: React.CSSProperties = { padding: 12, border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 15 };
const select: React.CSSProperties = { ...input, background: "white" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,350px),1fr))", gap: 14 };
const card: React.CSSProperties = { padding: 18, border: "1px solid #e2e8f0", borderRadius: 15, background: "white", textAlign: "left", cursor: "pointer", boxShadow: "0 2px 8px rgba(15,23,42,.05)" };
const cardTop: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const typeBadge: React.CSSProperties = { color: "#1d4ed8", fontSize: 12, fontWeight: 900, textTransform: "uppercase" };
const customer: React.CSSProperties = { margin: "5px 0 12px", color: "#0f172a", fontSize: 21 };
const statusBadge: React.CSSProperties = { padding: "5px 8px", borderRadius: 999, background: "#e0f2fe", color: "#075985", fontSize: 11, fontWeight: 800, textTransform: "capitalize" };
const appointment: React.CSSProperties = { display: "block", padding: 11, borderRadius: 9, background: "#eff6ff", color: "#1e3a8a" };
const details: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 12 };
const notes: React.CSSProperties = { margin: "12px 0 0", color: "#475569", whiteSpace: "pre-wrap" };
const workflowGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9, marginTop: 14, padding: 12, borderRadius: 10, background: "#f8fafc" };
const workflowField: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" };
const workflowInput: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8, background: "white", color: "#0f172a", fontSize: 13, textTransform: "none" };
const checkRow: React.CSSProperties = { display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, color: "#334155", fontSize: 13, fontWeight: 700 };
const completeButton: React.CSSProperties = { width: "100%", marginTop: 14, padding: 11, border: 0, borderRadius: 9, background: "#16a34a", color: "white", fontWeight: 800, cursor: "pointer" };
const taskActions: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 };
const archiveButton: React.CSSProperties = { flex: 1, padding: 9, border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", color: "#334155", fontWeight: 800, cursor: "pointer" };
const empty: React.CSSProperties = { padding: 40, border: "1px dashed #cbd5e1", borderRadius: 14, background: "white", color: "#64748b", textAlign: "center" };
