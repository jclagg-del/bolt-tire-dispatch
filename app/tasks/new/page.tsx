"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";

const TASK_TYPES = ["Brake Service", "Oil Change", "Air Filter Service", "Parts Replacement", "Axle / Driveline", "Diagnostics", "General Service"];
type Vehicle = { id: string; name: string };

export default function NewTaskPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer: "", vehicle: "", vehicle_mileage: "", address: "", scheduled: "",
    vehicle_id: "service", service_type: "General Service", po_number: "",
    parts: "", notes: "", job_status: "scheduled",
  });

  useEffect(() => {
    supabase.from("vehicles").select("id,name").eq("active", true).order("sort_order").then(({ data }) => {
      setVehicles((data as Vehicle[]) || []);
    });
  }, []);

  const change = (name: string, value: string) => setForm((current) => ({ ...current, [name]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.customer.trim()) return alert("Please enter a customer.");
    if (!form.scheduled) return alert("Please choose a scheduled date and time.");
    setSaving(true);
    const combinedNotes = [
      form.parts.trim() ? `Parts needed: ${form.parts.trim()}` : "",
      form.notes.trim(),
    ].filter(Boolean).join("\n");
    const { data, error } = await supabase.from("jobs").insert({
      customer: form.customer.trim(),
      vehicle: form.vehicle.trim() || null,
      vehicle_mileage: form.vehicle_mileage.trim() || null,
      address: form.address.trim() || null,
      scheduled: `${form.scheduled}:00`,
      vehicle_id: form.vehicle_id,
      service_type: form.service_type,
      po_number: form.po_number.trim() || null,
      notes: combinedNotes || null,
      job_status: form.job_status,
      payment_status: "unpaid",
      complete: false,
      archived: false,
      tire_disposal_fee: 0,
      ny_state_tire_fee: 0,
    }).select("id").single();
    setSaving(false);
    if (error || !data) return alert(`Unable to save task: ${error?.message || "No task returned."}`);
    router.push("/tasks");
    router.refresh();
  };

  return (
    <div style={shell}>
      <AppHeader />
      <main style={page}>
        <section style={hero}>
          <div><div style={eyebrow}>Tasks</div><h1 style={title}>Add Task</h1><p style={subtitle}>Schedule non-tire service work and reserve a vehicle and technician.</p></div>
          <button type="button" style={secondaryButton} onClick={() => router.push("/tasks")}>Back to Tasks</button>
        </section>
        <form style={card} onSubmit={save}>
          <h2 style={sectionTitle}>Customer and Vehicle</h2>
          <div style={grid}>
            <Field label="Customer *"><input style={input} value={form.customer} onChange={(e) => change("customer", e.target.value)} /></Field>
            <Field label="Customer Vehicle"><input style={input} placeholder="Year, make, model or unit" value={form.vehicle} onChange={(e) => change("vehicle", e.target.value)} /></Field>
            <Field label="Mileage"><input style={input} inputMode="numeric" value={form.vehicle_mileage} onChange={(e) => change("vehicle_mileage", e.target.value)} /></Field>
            <Field label="Service Address"><input style={input} value={form.address} onChange={(e) => change("address", e.target.value)} /></Field>
          </div>
          <h2 style={sectionTitle}>Scheduling</h2>
          <div style={grid}>
            <Field label="Scheduled Date and Time *"><input type="datetime-local" style={input} value={form.scheduled} onChange={(e) => change("scheduled", e.target.value)} /></Field>
            <Field label="Assigned Service Vehicle"><select style={input} value={form.vehicle_id} onChange={(e) => change("vehicle_id", e.target.value)}>{vehicles.length ? vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>) : <option value="service">Service Truck</option>}</select></Field>
            <Field label="Task Type"><select style={input} value={form.service_type} onChange={(e) => change("service_type", e.target.value)}>{TASK_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
            <Field label="RO / PO Number"><input style={input} value={form.po_number} onChange={(e) => change("po_number", e.target.value)} /></Field>
            <Field label="Status"><select style={input} value={form.job_status} onChange={(e) => change("job_status", e.target.value)}><option value="scheduled">Scheduled</option><option value="approved">Approved</option><option value="waiting_parts">Waiting for Parts</option><option value="in_progress">In Progress</option></select></Field>
          </div>
          <h2 style={sectionTitle}>Work Details</h2>
          <Field label="Parts Needed"><textarea style={textarea} value={form.parts} onChange={(e) => change("parts", e.target.value)} /></Field>
          <Field label="Work Requested and Notes"><textarea style={textarea} value={form.notes} onChange={(e) => change("notes", e.target.value)} /></Field>
          <button type="submit" style={primaryButton} disabled={saving}>{saving ? "Saving..." : "Save Task"}</button>
        </form>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={labelStyle}><span>{label}</span>{children}</label>;
}

const shell: React.CSSProperties = { minHeight: "100vh", background: "#f8fafc" };
const page: React.CSSProperties = { maxWidth: 980, margin: "0 auto", padding: 20 };
const hero: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 22, background: "white", border: "1px solid #e2e8f0", borderRadius: 18 };
const eyebrow: React.CSSProperties = { color: "#2563eb", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" };
const title: React.CSSProperties = { margin: "4px 0", color: "#0f172a", fontSize: 34 };
const subtitle: React.CSSProperties = { margin: 0, color: "#64748b" };
const card: React.CSSProperties = { marginTop: 18, padding: 22, border: "1px solid #e2e8f0", borderRadius: 18, background: "white" };
const sectionTitle: React.CSSProperties = { margin: "22px 0 12px", color: "#0f172a", fontSize: 18 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, color: "#334155", fontSize: 13, fontWeight: 800 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #cbd5e1", borderRadius: 10, background: "white", fontSize: 15 };
const textarea: React.CSSProperties = { ...input, minHeight: 90, resize: "vertical", marginBottom: 14 };
const primaryButton: React.CSSProperties = { width: "100%", marginTop: 8, padding: 13, border: 0, borderRadius: 10, background: "#2563eb", color: "white", fontSize: 16, fontWeight: 800, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { padding: "10px 13px", border: "1px solid #cbd5e1", borderRadius: 9, background: "white", color: "#0f172a", fontWeight: 800, cursor: "pointer" };
