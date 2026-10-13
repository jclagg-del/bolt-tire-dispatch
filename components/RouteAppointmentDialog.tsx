"use client";

import { useEffect, useRef, useState } from "react";
import { validRouteDateTime } from "@/lib/route-order";

export default function RouteAppointmentDialog({ customer, current, suggested, today, saving, onCancel, onSave }: {
  customer: string; current: string; suggested: string; today: string; saving: boolean;
  onCancel: () => void; onSave: (scheduled: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scheduled, setScheduled] = useState(suggested);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const valid = validRouteDateTime(scheduled) && scheduled.slice(0, 10) >= today;
  return <dialog ref={dialog} aria-labelledby="route-appointment-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }}
    style={{ width: "min(480px, calc(100vw - 32px))", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 18, padding: 24, color: "#0f172a", boxShadow: "0 20px 60px #0004" }}>
    <form onSubmit={event => { event.preventDefault(); if (valid && !saving) onSave(`${scheduled.slice(0, 16)}:00`); }}>
      <h2 id="route-appointment-title" style={{ margin: "0 0 8px", fontSize: 24 }}>Update appointment</h2>
      <p style={{ fontWeight: 700 }}>{customer}</p>
      <p style={{ color: "#475569", lineHeight: 1.5 }}>Current: {current.replace("T", " at ")} (New York time)</p>
      <label htmlFor="route-appointment-time" style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>New date and time</label>
      <input id="route-appointment-time" type="datetime-local" required autoFocus min={`${today}T00:00`} value={scheduled} disabled={saving}
        onChange={event => setScheduled(event.target.value)} style={{ boxSizing: "border-box", width: "100%", minHeight: 48, padding: 12, fontSize: 16, border: "1px solid #94a3b8", borderRadius: 10 }} />
      <p style={{ color: "#475569", lineHeight: 1.5 }}>Prefilled from where you dropped the job. Adjust it as needed. Other appointments will not change—even if they share this time.</p>
      {scheduled.slice(0, 10) > today && <p>This job will move off today’s route to the selected day.</p>}
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button type="button" disabled={saving} onClick={onCancel} style={{ ...button, background: "#e2e8f0", color: "#0f172a" }}>Cancel</button>
        <button type="submit" disabled={!valid || saving} style={{ ...button, background: "#2563eb", color: "white", opacity: valid && !saving ? 1 : 0.6 }}>{saving ? "Saving…" : "Save time & route"}</button>
      </div>
    </form>
  </dialog>;
}
const button = { flex: 1, minHeight: 48, padding: "12px 16px", border: 0, borderRadius: 10, fontWeight: 700, cursor: "pointer" };
