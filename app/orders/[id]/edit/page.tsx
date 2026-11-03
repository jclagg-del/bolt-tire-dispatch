"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import { FLEET_CUSTOMERS, PURCHASE_LOCKED_FIELDS, normalizeOrderEdit, type OrderEditFields } from "@/lib/staff-order-edit";

type Facility = { id: number; name: string; address: string; contact_name: string | null; contact_number: string | null };
type EditData = { order: OrderEditFields & { id: number }; version: string; purchaseLocked: boolean; facilities: Facility[] };
async function orderRequest(id: string, changes?: unknown) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Please sign in again.");
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}/edit`, {
    method: changes ? "PATCH" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
    ...(changes ? { body: JSON.stringify(changes) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The order could not be loaded.");
  return result;
}

export default function StaffOrderEditPage() {
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const [data, setData] = useState<EditData | null>(null);
  const [draft, setDraft] = useState<OrderEditFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const next = await orderRequest(id); setData(next); setDraft(next.order); setDirty(false); }
    catch (error) { setError(error instanceof Error ? error.message : "Order could not be loaded."); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const back = () => { if (!dirty || window.confirm("Discard your unsaved order changes?")) router.push("/orders"); };
  const reload = () => { if (!dirty || window.confirm("Reload the latest saved order and discard your unsaved changes?")) void load(); };
  const change = (key: keyof OrderEditFields, value: string | number | boolean | null) => {
    setDraft(current => current ? { ...current, [key]: value } : current); setDirty(true);
  };
  const chooseFacility = (value: string) => {
    if (!value) { change("facility_id", null); return; }
    const facility = data?.facilities.find(item => String(item.id) === value);
    if (!facility) return;
    setDraft(current => current ? { ...current, facility_id: facility.id, facility_name: facility.name, address: facility.address,
      contact_name: facility.contact_name || current.contact_name, contact_number: facility.contact_number || current.contact_number } : current);
    setDirty(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || !data || saving) return;
    setError(""); setSaving(true);
    try {
      const changes = normalizeOrderEdit(draft);
      await orderRequest(id, { changes, version: data.version });
      setDirty(false); router.push("/orders?edited=" + id); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "The order could not be saved."); }
    finally { setSaving(false); }
  };
  const input = (key: keyof OrderEditFields, text: string, required = false, type = "text") => <label style={label} key={key}>{text}{required ? " *" : ""}
    <input style={field} type={type} required={required} value={String(draft?.[key] ?? "")} min={type === "number" ? 1 : undefined} step={type === "number" ? 1 : undefined}
      placeholder={key === "tire_size" ? "Example: 205/55R16 (size only)" : key === "tire_model" ? "Example: Assurance All-Season" : key === "tire_product_number" ? "Example: 407781374 (part number only)" : undefined}
      disabled={saving || Boolean(data?.purchaseLocked && (PURCHASE_LOCKED_FIELDS as readonly string[]).includes(key))}
      onChange={event => change(key, type === "number" ? Number(event.target.value) : event.target.value)} />
  </label>;

  return <><AppHeader /><main style={shell}>
    <button type="button" onClick={back} disabled={saving} style={secondary}>← Back to Orders</button>
    <h1>Edit order #{id}</h1>
    <p>Correct the submitted details before accepting. Saving does not create a job, buy tires, or send a customer message.</p>
    {error && <div role="alert" style={errorBox}>{error} <button type="button" onClick={reload} disabled={loading || saving} style={secondary}>Reload order</button></div>}
    {loading ? <p>Loading order…</p> : draft && data ? <form onSubmit={save}>
      <section style={card}><h2>Order & appointment</h2><div style={grid}>
        <label style={label}>Organization *<select style={field} value={String(draft.customer)} disabled={saving || data.purchaseLocked} onChange={event => change("customer", event.target.value)}>{FLEET_CUSTOMERS.map(name => <option key={name}>{name}</option>)}</select></label>
        <label style={label}>Order type *<select style={field} value={String(draft.service_method || "")} required disabled={saving} onChange={event => change("service_method", event.target.value)}><option value="">Choose type</option><option value="installed">Installed</option><option value="delivery">Delivery</option><option value="pickup">Pickup</option><option value="delivery_pickup">Delivery / Pickup</option></select></label>
        {input("requested_date", "Requested date", true, "date")}{input("requested_time", "Requested time (Eastern)", true, "time")}
      </div><p style={hint}>Appointments cannot start between noon and 1 PM.</p>
      <label><input type="checkbox" checked={Boolean(draft.goodyear_order)} disabled={saving || data.purchaseLocked} onChange={event => change("goodyear_order", event.target.checked)} /> Goodyear order</label></section>

      <section style={card}><h2>Facility & contact</h2><div style={grid}>
        <label style={label}>Saved facility<select style={field} value={String(draft.facility_id ?? "")} disabled={saving} onChange={event => chooseFacility(event.target.value)}>
          <option value="">Custom / manually entered facility</option>
          {draft.facility_id && !data.facilities.some(item => item.id === draft.facility_id) ? <option value={String(draft.facility_id)}>{String(draft.facility_name)} (current)</option> : null}
          {data.facilities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label style={label}>Facility name *<input style={field} required value={String(draft.facility_name ?? "")} disabled={saving || Boolean(draft.facility_id)} onChange={event => change("facility_name", event.target.value)} /></label>
        {input("address", "Service address", true)}{input("submitted_by", "Submitted by", true)}
        {input("contact_name", "Contact person", true)}{input("contact_number", "Contact phone", true, "tel")}
      </div><p style={hint}>Selecting a facility fills its saved address and available contact details. Corrections here affect this order only—not the saved facility.</p></section>

      <section style={card}><h2>Vehicle & references</h2><div style={grid}>
        {input("vehicle_year", "Year", true)}{input("vehicle_make", "Make", true)}{input("vehicle_model", "Model", true)}{input("vehicle_color", "Color")}{input("license_plate", "License plate")}
        {input("job_number", "Job / PO number", true)}{input("mo_number", "MO number", true)}
      </div></section>
      <section style={card}><h2>Tires</h2>
        {data.purchaseLocked && <p role="status" style={notice}>A supplier purchase exists or the tires are marked ordered. Tire, quantity, organization and reference fields are locked to protect that purchase.</p>}
        <div style={grid}>{input("qty", "Quantity", true, "number")}{input("tire_size", "Tire size", true)}{input("tire_model", "Tire model")}{input("tire_product_number", "Part number")}{input("tire_position", "Tire position")}</div>
        <label style={label}>Notes<textarea style={{ ...field, minHeight: 110 }} value={String(draft.notes ?? "")} disabled={saving} maxLength={10000} onChange={event => change("notes", event.target.value)} /></label>
      </section>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}><button type="submit" disabled={saving || !dirty} style={primary}>{saving ? "Saving…" : "Save order changes"}</button><button type="button" disabled={saving} onClick={back} style={secondary}>Cancel — keep saved order</button></div>
      <p style={hint}>After saving, use “Approve & Create Job” on the Orders page when you’re ready.</p>
    </form> : null}
  </main></>;
}

const shell: React.CSSProperties = { maxWidth: 950, margin: "0 auto", padding: "24px 16px 60px", color: "#0f172a" };
const card: React.CSSProperties = { background: "white", border: "1px solid #dbe3ef", borderRadius: 14, padding: 20, marginTop: 18 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 16 };
const label: React.CSSProperties = { display: "grid", gap: 7, fontSize: 14, fontWeight: 700, marginTop: 8 };
const field: React.CSSProperties = { boxSizing: "border-box", minWidth: 0, width: "100%", padding: 12, border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 16, color: "#0f172a" };
const hint: React.CSSProperties = { color: "#475569", fontSize: 13, lineHeight: 1.5 };
const primary: React.CSSProperties = { border: 0, borderRadius: 10, padding: "13px 18px", background: "#2563eb", color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer" };
const secondary: React.CSSProperties = { ...primary, background: "#f1f5f9", color: "#0f172a", border: "1px solid #cbd5e1" };
const notice: React.CSSProperties = { padding: 14, borderRadius: 10, background: "#eff6ff", color: "#1e40af" };
const errorBox: React.CSSProperties = { ...notice, background: "#fef2f2", color: "#991b1b" };
