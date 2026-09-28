"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PurchaseDetails } from "./CustomerOrderPurchase";

type Product = { atdProductNumber: string; lineCode: string; brand: string; model: string; size: string; cost: number | null; warehouses: Array<{ code: string; name: string; quantity: number; local: boolean; deliveryDate: string | null }> };
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

export default function UsafPurchase({ onClose, onComplete, initialPart = "", initialQuantity = 1 }: { onClose: () => void; onComplete: () => void; initialPart?: string; initialQuantity?: number }) {
  const [mode, setMode] = useState<Mode>("unavailable");
  const [ready, setReady] = useState(false);
  const [part, setPart] = useState(initialPart);
  const [quantity, setQuantity] = useState(initialQuantity);
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
  const [searching, setSearching] = useState(false);
  const [lookupLineCode, setLookupLineCode] = useState("");
  const [lookupRetry, setLookupRetry] = useState(0);
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

  useEffect(() => {
    if (!ready || locked || completed || !part.trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > 24) return;
    let active = true;
    setSearching(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        let result = await api({ action: "search", mode, part, quantity, lineCode: lookupLineCode });
        if (!active) return;
        if (result.products?.length === 1 && !result.products[0].warehouses.length && result.products[0].lineCode && !lookupLineCode) {
          result = await api({ action: "search", mode, part, quantity, lineCode: result.products[0].lineCode });
        }
        if (!active) return;
        setProducts(result.products || []);
        const selected: Product | undefined = result.products?.length === 1 ? result.products[0] : result.products?.find((item: Product) => item.lineCode === lookupLineCode);
        setLineCode(selected?.lineCode || "");
        setBranch(selected?.warehouses.find(item => item.quantity >= quantity)?.code || "");
        if (!result.products?.length) setError("No exact product-number match was returned by USAF.");
        else if (selected && !selected.warehouses.length) setError("USAF did not return warehouse availability for this tire.");
      } catch (reason) {
        if (active) { setProducts([]); setLineCode(""); setBranch(""); setError(reason instanceof Error ? reason.message : "Unable to load tire and warehouses."); }
      } finally { if (active) setSearching(false); }
    }, 300);
    return () => { active = false; clearTimeout(timer); setSearching(false); };
  }, [ready, mode, part, quantity, lookupLineCode, lookupRetry, locked, completed]);

  function resetPreview() { setPreview(null); setToken(""); setConfirmed(false); }
  function resetProduct() { resetPreview(); setProducts([]); setLineCode(""); setLookupLineCode(""); setBranch(""); }
  async function run(action: "preview" | "place") {
    if (inFlight.current || searching || locked || completed) return;
    if (action === "place" && (!preview || !token || (mode === "test" && !confirmed))) return;
    inFlight.current = true; setBusy(true); setError("");
    if (action !== "place") resetPreview();
    try {
      // Any unconfirmed purchase response locks this window; never blindly retry a POST.
      if (action === "place") setLocked(true);
      const result = await api({ action, mode, part, quantity, po, mo, lineCode, branch, token, confirmation: action === "place" ? (mode === "test" ? "SEND TEST ORDER" : "PLACE LIVE ORDER") : "" });
      if (result.completed) { setCompleted(result.completed); setMode(result.mode); setWarning(result.warning || ""); if (result.receipt) { setPart(result.receipt.part); setQuantity(result.receipt.quantity); setPo(result.receipt.po); setReceiptDescription(result.receipt.description); } onComplete(); }
      else { setPreview(result.preview); setToken(result.token); }
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
    {mode === "test" && <div className="atd-order-policy" role="status"><strong>TEST ONLY — DO NOT FULFILL</strong><span>Sent only to USAF’s test server. No customer job or notification is created.</span></div>}
    {error && <p role="alert" className="atd-order-error">{error}</p>}
    {warning && <p role="alert">{warning}</p>}
    {completed ? <div className="atd-order-success" role="status"><strong>{mode === "test" ? "TEST order accepted" : "Order accepted"}</strong><span>USAF confirmation: {completed.confirmation}</span><span>PO: {po.toUpperCase()} · {quantity} tire(s) · Part #{part}</span><span>{receiptDescription}</span><span>Supplier total: {money(completed.total)}</span><span>{mode === "test" ? "Test delivery estimate" : "Estimated delivery"}: {completed.deliveryDate || "Not provided"}</span><span>Recorded in Supplier Orders. No job was automatically created.</span><button type="button" onClick={onClose}>Done — return to Supplier Orders</button></div> : <>
      <fieldset disabled={busy || locked || !ready} style={{ border: 0, padding: 0, margin: "18px 0", display: "grid", gap: 12, minWidth: 0 }}>
        {!initialPart && <label className="customer-order-purchase-field">Product number<input value={part} maxLength={28} onChange={e => { setPart(e.target.value); resetProduct(); }} /></label>}
        {initialPart && !product && <span>Part #{part}</span>}
        {products.length > 1 && <label className="customer-order-purchase-field">Tire<select disabled={searching} value={lineCode} onChange={e => { setLineCode(e.target.value); setLookupLineCode(e.target.value); setBranch(""); resetPreview(); }}><option value="">Choose tire</option>{products.map(item => <option key={item.lineCode} value={item.lineCode}>{item.brand} {item.model} {item.size} · #{item.atdProductNumber} · {money(item.cost)} each</option>)}</select></label>}
        {product && products.length === 1 && <div className="atd-order-preview"><strong>{product.brand} {product.model} {product.size}</strong><span>Part #{product.atdProductNumber} · {money(product.cost)} each</span></div>}
        {searching && <p role="status">Loading tire and warehouses…</p>}
        {error && !searching && !locked && <button type="button" onClick={() => { resetPreview(); setLookupRetry(value => value + 1); }}>Reload tire and warehouses</button>}
        {product && <label className="customer-order-purchase-field">Warehouse<select disabled={searching} value={branch} onChange={e => { setBranch(e.target.value); resetPreview(); }}><option value="">Choose warehouse</option>{product.warehouses.map(item => <option key={item.code} value={item.code} disabled={item.quantity < quantity}>{item.name}{item.local ? " — Local" : ""} · {item.quantity} available · ETA {item.deliveryDate || "not provided"}</option>)}</select></label>}
        <label className="customer-order-purchase-field">Quantity<input type="number" min={1} max={24} value={quantity} onChange={e => { setQuantity(Number(e.target.value)); resetProduct(); }} /></label>
        <label className="customer-order-purchase-field">{mode === "test" ? "Test PO (starts with TEST)" : "Job / PO number"}<input value={po} maxLength={15} onChange={e => { setPo(e.target.value.toUpperCase()); resetPreview(); }} /></label>
        {mode === "production" && <label className="customer-order-purchase-field">MO number (optional)<input value={mo} maxLength={40} onChange={e => { setMo(e.target.value); resetPreview(); }} /></label>}
      </fieldset>
      {preview && <div className="atd-order-preview"><strong>{quantity} × {product?.brand} {product?.model} {product?.size}</strong><span>Part #{part} · PO {po}</span><strong>USAF estimated total: {money(preview.total)}</strong><span>Estimated delivery: {preview.deliveryDate || "Not provided"}</span>{preview.shipments.map((item, i) => <span key={i}>{item.quantity} tires · {item.warehouse} · {item.shipMethod}</span>)}{preview.message && <p>{preview.message}</p>}{mode === "test" && <label><input type="checkbox" checked={confirmed} disabled={busy || locked} onChange={e => setConfirmed(e.target.checked)} /> I confirm this is a TEST ONLY order — DO NOT FULFILL.</label>}</div>}
      {busy && <p role="status">{locked ? "Submitting order — do not close or retry…" : "Checking USAF…"}</p>}
      <div className="atd-order-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Close</button>{preview ? <button type="button" className="place" disabled={busy || searching || locked || !token || (mode === "test" && !confirmed)} onClick={() => run("place")}>{mode === "test" ? "Send TEST order" : `Place order · ${money(preview.total)}`}</button> : <button type="button" disabled={busy || searching || locked || !product || !branch || !ready || !po.trim()} onClick={() => run("preview")}>Review price & delivery</button>}</div>
    </>}
  </section></div>;
}
