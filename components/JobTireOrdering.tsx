"use client";

import { useEffect, useRef, useState } from "react";
import CustomerOrderPurchase, { purchaseApi, type PurchaseDetails } from "./CustomerOrderPurchase";
import { tireShopSizeLink } from "@/lib/tire-shop-entry";

type Fields = { customer: string; tires: string; size: string; qty: string; tire_product_number: string; po_number: string; mo_number: string; tire_supplier: string; tires_ordered: boolean; estimated_delivery_date?: string; tire_manufacturer_part_number?: string };
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
  const [linkedJobId, setLinkedJobId] = useState<string | number | null>(null);
  const linkedFields = useRef<Fields | null>(null);
  const latest = useRef({ form, onComplete }); latest.current = { form, onComplete };
  useEffect(() => {
    if (linkedJobId == null) return;
    let active = true, checking = false;
    async function refresh() {
      if (checking || !active) return;
      checking = true;
      try {
        const result = await purchaseApi({ action: "context", jobId: linkedJobId });
        if (!active || !result.completed) return;
        const fields = latest.current.form, original = linkedFields.current;
        if (result.completed.syncApplied === false) { setError(result.warning || "Purchase confirmed, but this job needs review. Do not reorder."); return; }
        if (!original || ["tire_product_number", "tires", "tire_supplier", "estimated_delivery_date", "tire_manufacturer_part_number", "qty", "size"].some(key => (fields[key as keyof Fields] || "") !== (original[key as keyof Fields] || ""))) {
          if (!fields.tires_ordered) setError("Purchase confirmed and saved. You also edited tire details in this tab; reload the job to review the saved purchase before saving more changes.");
          return;
        }
        latest.current.onComplete(result.completed); setError("");
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Could not refresh the linked purchase."); }
      finally { checking = false; }
    }
    const changed = (event: StorageEvent) => { if (event.key === "bolt-tire-purchase-updated") void refresh(); };
    window.addEventListener("focus", refresh); window.addEventListener("storage", changed);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("storage", changed); };
  }, [linkedJobId]);
  const quantity = Number(form.qty);
  const browseBySize = !form.tire_product_number.trim();
  const shopLink = tireShopSizeLink(form.size, form.qty);
  const missing = browseBySize ? (!shopLink ? "Enter the tire size to search Tire Shop." : "") : !form.customer.trim() ? "Enter the customer name first." : !form.po_number.trim() ? "Enter the job / PO number first." : !Number.isInteger(quantity) || quantity < 1 || quantity > 24 ? "Enter a quantity from 1 to 24." : "";
  async function open() {
    if (inFlight.current || disabled || missing || form.tires_ordered) return;
    // Open synchronously during the click, before saving, so Safari doesn't
    // block the linked shop as an asynchronous popup. Never leave an opener.
    const shopWindow = browseBySize ? window.open("about:blank", "_blank") : null;
    if (browseBySize && !shopWindow) { setError("Allow the Tire Shop tab to open, then try again."); return; }
    if (shopWindow) shopWindow.opener = null;
    inFlight.current = true; setBusy(true); setError("");
    const fields = { ...form };
    try {
      const id = await onPrepare();
      if (id == null) { shopWindow?.close(); setError("Save the job successfully before opening a linked purchase."); }
      else if (shopWindow) { linkedFields.current = fields; setLinkedJobId(id); shopWindow.location.href = tireShopSizeLink(fields.size, fields.qty, { jobId: id })!; }
      else setPurchase({ id, fields });
    } catch (reason) { shopWindow?.close(); setError(reason instanceof Error ? reason.message : "The job could not be saved."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div style={{ padding: 16, borderRadius: 12, marginBottom: 16, background: form.tires_ordered ? "#ecfdf5" : "#eff6ff", border: "1px solid #bfdbfe", minWidth: 0, overflowWrap: "anywhere" }}>
    {form.tires_ordered ? <strong style={{ color: "#166534" }}>Tires Ordered</strong> : <>
      <button type="button" onClick={open} disabled={disabled || busy || Boolean(missing)} style={{ padding: "12px 18px", border: 0, borderRadius: 9, color: "white", background: "#2563eb", fontWeight: 800, cursor: "pointer", opacity: disabled || busy || missing ? .6 : 1 }}>{busy ? "Saving job…" : "Order tires"}</button>
      <p style={{ margin: "8px 0", fontSize: 13 }}>{form.qty || "—"} × {form.tires || "Tire"} · {form.size || "Size not entered"} · Part #{form.tire_product_number || "—"}</p>
      <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>{missing || (browseBySize ? "Saves this job and opens Tire Shop by size in a new tab. A confirmed purchase automatically fills in the part, supplier and estimated delivery here." : "Saves this job, then opens the exact tire to review supplier, warehouse, price and delivery before placing the order.")}</p>
    </>}
    <details style={{ marginTop: 10, fontSize: 13 }}><summary>{form.tires_ordered ? "Update manual ordering status" : "Already ordered elsewhere?"}</summary><label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}><input type="checkbox" checked={form.tires_ordered} disabled={disabled || busy} onChange={event => onManualChange(event.target.checked)} />Tires ordered outside this button</label><p>Save the job after manual changes. This does not place or cancel a supplier order.</p></details>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    {purchase && <CustomerOrderPurchase jobContext initialSupplier={purchase.fields.tire_supplier.trim().toUpperCase() === "ATD" ? "ATD" : "USAF"} order={{ id: purchase.id, customer: purchase.fields.customer, job_number: purchase.fields.po_number.trim(), mo_number: purchase.fields.mo_number.trim(), tire_product_number: purchase.fields.tire_product_number.trim(), tire_size: [purchase.fields.tires, purchase.fields.size].filter(Boolean).join(" · "), qty: Number(purchase.fields.qty) }} onClose={() => setPurchase(null)} onComplete={onComplete} />}
  </div>;
}
