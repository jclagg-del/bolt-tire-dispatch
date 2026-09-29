"use client";

import { useRef, useState } from "react";
import CustomerOrderPurchase, { type PurchaseDetails } from "./CustomerOrderPurchase";

type Fields = { customer: string; tires: string; size: string; qty: string; tire_product_number: string; po_number: string; mo_number: string; tire_supplier: string; tires_ordered: boolean };
export default function JobTireOrdering({ form, disabled, onPrepare, onComplete, onManualChange }: {
  form: Fields; disabled: boolean;
  onPrepare: () => Promise<string | number | null>;
  onComplete: (details: PurchaseDetails) => void;
  onManualChange: (ordered: boolean) => void;
}) {
  const [purchase, setPurchase] = useState<{ id: string | number; fields: Fields } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const quantity = Number(form.qty);
  const missing = !form.customer.trim() ? "Enter the customer name first." : !form.tire_product_number.trim() ? "Enter the tire product number first." : !form.po_number.trim() ? "Enter the job / PO number first." : !Number.isInteger(quantity) || quantity < 1 || quantity > 24 ? "Enter a quantity from 1 to 24." : "";
  async function open() {
    if (inFlight.current || disabled || missing || form.tires_ordered) return;
    inFlight.current = true; setBusy(true); setError("");
    const fields = { ...form };
    try {
      const id = await onPrepare();
      if (id != null) setPurchase({ id, fields });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The job could not be saved."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div style={{ padding: 16, borderRadius: 12, marginBottom: 16, background: form.tires_ordered ? "#ecfdf5" : "#eff6ff", border: "1px solid #bfdbfe", minWidth: 0, overflowWrap: "anywhere" }}>
    {form.tires_ordered ? <strong style={{ color: "#166534" }}>Tires Ordered</strong> : <>
      <button type="button" onClick={open} disabled={disabled || busy || Boolean(missing)} style={{ padding: "12px 18px", border: 0, borderRadius: 9, color: "white", background: "#2563eb", fontWeight: 800, cursor: "pointer", opacity: disabled || busy || missing ? .6 : 1 }}>{busy ? "Saving job…" : "Order tires"}</button>
      <p style={{ margin: "8px 0", fontSize: 13 }}>{form.qty || "—"} × {form.tires || "Tire"} · {form.size || "Size not entered"} · Part #{form.tire_product_number || "—"}</p>
      <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>{missing || "Saves this job, then opens the exact tire to review supplier, warehouse, price and delivery before placing the order."}</p>
    </>}
    <details style={{ marginTop: 10, fontSize: 13 }}><summary>{form.tires_ordered ? "Update manual ordering status" : "Already ordered elsewhere?"}</summary><label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}><input type="checkbox" checked={form.tires_ordered} disabled={disabled || busy} onChange={event => onManualChange(event.target.checked)} />Tires ordered outside this button</label><p>Save the job after manual changes. This does not place or cancel a supplier order.</p></details>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    {purchase && <CustomerOrderPurchase jobContext initialSupplier={purchase.fields.tire_supplier.trim().toUpperCase() === "ATD" ? "ATD" : "USAF"} order={{ id: purchase.id, customer: purchase.fields.customer, job_number: purchase.fields.po_number.trim(), mo_number: purchase.fields.mo_number.trim(), tire_product_number: purchase.fields.tire_product_number.trim(), tire_size: [purchase.fields.tires, purchase.fields.size].filter(Boolean).join(" · "), qty: Number(purchase.fields.qty) }} onClose={() => setPurchase(null)} onComplete={onComplete} />}
  </div>;
}
