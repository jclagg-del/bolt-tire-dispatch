"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";

type Task = {
  id: number;
  customer: string | null;
  vehicle: string | null;
  unit_number: string | null;
  vehicle_id: string | null;
  scheduled: string | null;
  service_type: string | null;
  po_number: string | null;
  notes: string | null;
  job_status: string | null;
  complete: boolean | null;
};

export const TASK_TYPES = [
  "Brake Service",
  "Oil Change",
  "Air Filter Service",
  "Parts Replacement",
  "Axle / Driveline",
  "Diagnostics",
  "General Service",
];

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

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id,customer,vehicle,unit_number,vehicle_id,scheduled,service_type,po_number,notes,job_status,complete")
        .eq("archived", false)
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
      if (status === "open" && (task.complete || ["completed", "billed", "paid"].includes(taskStatus))) return false;
      if (status === "completed" && !task.complete && !["completed", "billed", "paid"].includes(taskStatus)) return false;
      if (query && ![task.customer, task.vehicle, task.unit_number, task.service_type, task.po_number, task.notes].filter(Boolean).join(" ").toLowerCase().includes(query)) return false;
      return true;
    });
  }, [tasks, search, status]);

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
            <option value="all">All tasks</option>
          </select>
        </section>

        {loading ? <div style={empty}>Loading tasks...</div> : visibleTasks.length === 0 ? (
          <div style={empty}>No tasks match this view.</div>
        ) : (
          <div style={grid}>
            {visibleTasks.map((task) => (
              <button key={task.id} type="button" style={card} onClick={() => router.push(`/jobs/${task.id}`)}>
                <div style={cardTop}>
                  <div>
                    <span style={typeBadge}>{task.service_type}</span>
                    <h2 style={customer}>{task.customer || "Task"}</h2>
                  </div>
                  <span style={statusBadge}>{task.complete ? "Completed" : task.job_status || "Scheduled"}</span>
                </div>
                <strong style={appointment}>{formatAppointment(task.scheduled)}</strong>
                <div style={details}>
                  <span><small>VEHICLE NUMBER</small>{task.unit_number || "—"}</span>
                  <span><small>YEAR / MAKE / MODEL</small>{task.vehicle || "—"}</span>
                  <span><small>RO / PO</small>{task.po_number || "—"}</span>
                </div>
                {task.notes ? <p style={notes}>{task.notes}</p> : null}
              </button>
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
const empty: React.CSSProperties = { padding: 40, border: "1px dashed #cbd5e1", borderRadius: 14, background: "white", color: "#64748b", textAlign: "center" };
