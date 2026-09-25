"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PurchaseDetails } from "./CustomerOrderPurchase";

type Product = { atdProductNumber: string; lineCode: string; brand: string; model: string; size: string; cost: number | null; warehouses: Array<{ code: string; name: string; quantity: number; local: boolean }> };
type Mode = "test" | "production" | "unavailable";
async function api(body: Record<string, unknown>) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 30_000) session = (await supabase.auth.refreshSession()).data.session;
  if (!session) throw new Error("Please sign in again.");
  const response = await fetch("/api/supplier-orders/usaf", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || "Supplier request failed."), { uncertain: result.uncertain });
  return result;
}
const money = (value: number | null) => value == null ? "Unavailable" : `$${value.toFixed(2)}`;

export default function UsafPurchase({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [mode, setMode] = useState<Mode>("unavailable");
  const [ready, setReady] = useState(false);
  const [part, setPart] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [po, setPo] = useState("");
  const [mo, setMo] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [lineCode, setLineCode] = useState("");
  const [branch, setBranch] = useState("");
  const [preview, setPreview] = useState<PurchaseDetails | null>(null);
  const [completed, setCompleted] = useState<PurchaseDetails | null>(null);
  const [receiptDescription, setReceiptDescription] = useState("");
  const [token, setToken] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const inFlight = useRef(false);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const product = products.find(item => item.lineCode === lineCode);

  useEffect(() => {
    let active = true;
    closeButton.current?.focus();
    api({ action: "configuration" }).then(result => {
      if (!active) return;
      setMode(result.mode); setReady(result.configured && result.mode !== "unavailable");
      if (result.mode === "test") setPo(`TEST-${Date.now().toString(36).toUpperCase()}`);
      if (!result.configured || result.mode === "unavailable") setError("USAF ordering is not configured for a recognized test or production server.");
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  function resetPreview() { setPreview(null); setToken(""); setConfirmed(false); }
  function resetProduct() { resetPreview(); setProducts([]); setLineCode(""); setBranch(""); }
  async function run(action: "search" | "preview" | "place", choice = "") {
    if (inFlight.current || locked || completed) return;
    inFlight.current = true; setBusy(true); setError("");
    if (action !== "place") resetPreview();
    try {
      // Any unconfirmed purchase response locks this window; never blindly retry a POST.
      if (action === "place") setLocked(true);
      let result = await api({ action, mode, part, quantity, po, mo, lineCode: choice || lineCode, branch, token, confirmation: confirmed ? (mode === "test" ? "SEND TEST ORDER" : "PLACE LIVE ORDER") : "" });
      if (action === "search" && result.products?.length === 1 && !result.products[0].warehouses.length && result.products[0].lineCode && !choice) {
        result = await api({ action: "search", mode, part, quantity, po, mo, lineCode: result.products[0].lineCode });
      }
      if (result.completed) { setCompleted(result.completed); setMode(result.mode); setWarning(result.warning || ""); if (result.receipt) { setPart(result.receipt.part); setQuantity(result.receipt.quantity); setPo(result.receipt.po); setReceiptDescription(result.receipt.description); } onComplete(); }
      else if (action === "search") {
        setProducts(result.products || []);
        const single: Product | undefined = result.products?.length === 1 ? result.products[0] : undefined;
        setLineCode(single?.lineCode || "");
        setBranch(single?.warehouses.find(item => item.quantity >= quantity)?.code || "");
        if (!result.products?.length) setError("No exact product-number match was returned by USAF.");
      } else { setPreview(result.preview); setToken(result.token); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Supplier request failed.");
      if (action === "place") setWarning("Do not submit another order until you check Supplier Orders for this PO. Your submission may have been accepted.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="atd-order-overlay"><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="usaf-purchase-title" className="atd-order-dialog customer-order-purchase" onKeyDown={event => {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key === "Tab") {
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),input:not([disabled])') || []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="atd-order-head"><div><span>U.S. AutoForce</span><h2 id="usaf-purchase-title">{mode === "test" ? "Create TEST order" : "Order tires"}</h2></div><button ref={closeButton} type="button" aria-label="Close order window" disabled={busy} onClick={onClose}>×</button></div>
    <div className="atd-order-policy" role="status"><strong>{mode === "test" ? "TEST ONLY — DO NOT FULFILL" : mode === "production" ? "LIVE PRODUCTION ORDERING" : "Checking connection…"}</strong><span>{mode === "test" ? "Sent only to USAF’s test server. The PO and supplier note identify this as a test. No customer job or notification is created." : "A confirmed order purchases tires on your USAF account. Use Orders for KSS/HPR requests to carry supplier details into their jobs."}</span></div>
    {error && <p role="alert" className="atd-order-error">{error}</p>}
    {warning && <p role="alert">{warning}</p>}
    {completed ? <div className="atd-order-success" role="status"><strong>{mode === "test" ? "TEST order accepted" : "Order accepted"}</strong><span>USAF confirmation: {completed.confirmation}</span><span>PO: {po.toUpperCase()} · {quantity} tire(s) · Part #{part}</span><span>{receiptDescription}</span><span>Supplier total: {money(completed.total)}</span><span>{mode === "test" ? "Test delivery estimate" : "Estimated delivery"}: {completed.deliveryDate || "Not provided"}</span><span>Recorded in Supplier Orders. No job was automatically created.</span><button type="button" onClick={onClose}>Done — return to Supplier Orders</button></div> : <>
      <fieldset disabled={busy || locked || !ready} style={{ border: 0, padding: 0, margin: "18px 0", display: "grid", gap: 12, minWidth: 0 }}>
        <label className="customer-order-purchase-field">Product number<input value={part} maxLength={28} onChange={e => { setPart(e.target.value); resetProduct(); }} /></label>
        <label className="customer-order-purchase-field">Quantity<input type="number" min={1} max={24} value={quantity} onChange={e => { setQuantity(Number(e.target.value)); resetProduct(); }} /></label>
        <label className="customer-order-purchase-field">{mode === "test" ? "Test PO (starts with TEST)" : "Job / PO number"}<input value={po} maxLength={15} onChange={e => { setPo(e.target.value.toUpperCase()); resetPreview(); }} /></label>
        {mode === "production" && <label className="customer-order-purchase-field">MO number (optional)<input value={mo} maxLength={40} onChange={e => { setMo(e.target.value); resetPreview(); }} /></label>}
        <button type="button" onClick={() => run("search")} disabled={!part.trim() || !po.trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > 24}>Find tire by product number</button>
        {products.length > 0 && <label className="customer-order-purchase-field">Matching tire<select value={lineCode} onChange={e => { const found = products.find(item => item.lineCode === e.target.value); setLineCode(e.target.value); resetPreview(); setBranch(found?.warehouses.find(item => item.quantity >= quantity)?.code || ""); if (found && !found.warehouses.length) run("search", found.lineCode); }}><option value="">Choose tire</option>{products.map(item => <option key={item.lineCode} value={item.lineCode}>{item.brand} {item.model} {item.size} · #{item.atdProductNumber} · {money(item.cost)} each</option>)}</select></label>}
        {product && <label className="customer-order-purchase-field">Warehouse<select value={branch} onChange={e => { setBranch(e.target.value); resetPreview(); }}><option value="">Choose warehouse</option>{product.warehouses.map(item => <option key={item.code} value={item.code} disabled={item.quantity < quantity}>{item.name}{item.local ? " — Local" : ""} · {item.quantity} available</option>)}</select></label>}
      </fieldset>
      {preview && <div className="atd-order-preview"><strong>{quantity} × {product?.brand} {product?.model} {product?.size}</strong><span>Part #{part} · PO {po} · {mode.toUpperCase()}</span><strong>USAF estimated total: {money(preview.total)}</strong><span>Estimated delivery: {preview.deliveryDate || "Not provided"}</span>{preview.shipments.map((item, i) => <span key={i}>{item.quantity} tires · {item.warehouse} · {item.shipMethod}</span>)}{preview.message && <p>{preview.message}</p>}<label><input type="checkbox" checked={confirmed} disabled={busy || locked} onChange={e => setConfirmed(e.target.checked)} /> {mode === "test" ? "I confirm this is a TEST ONLY order — DO NOT FULFILL." : "I authorize this LIVE purchase at the displayed price and quantity."}</label></div>}
      {busy && <p role="status">{locked ? "Submitting order — do not close or retry…" : "Checking USAF…"}</p>}
      <div className="atd-order-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Close</button>{preview ? <button type="button" className="place" disabled={busy || locked || !confirmed} onClick={() => run("place")}>{mode === "test" ? "Send TEST order" : `Place LIVE order · ${money(preview.total)}`}</button> : <button type="button" disabled={busy || locked || !product || !branch || !ready} onClick={() => run("preview")}>Review price & delivery</button>}</div>
    </>}
  </section></div>;
}
