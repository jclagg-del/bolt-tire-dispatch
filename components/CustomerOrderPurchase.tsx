"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PurchaseDetails = {
  supplier: string;
  confirmation: string;
  deliveryDate: string | null;
  total: number | null;
  status?: string;
  message?: string;
  shipments: Array<{ quantity: number; warehouse: string; deliveryDate: string | null; status: string; shipMethod: string }>;
};
type Product = { atdProductNumber: string; lineCode?: string; brand: string; model: string; size: string; loadSpeed: string; cost?: number | null; warehouses?: Array<{ code: string; name: string; local: boolean; quantity: number; deliveryDate: string | null }> };
type Order = { id: number; customer: string; job_number: string | null; mo_number: string | null; tire_product_number: string | null; tire_size: string; qty: number };

export async function purchaseApi(body: Record<string, unknown>) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  if (!session) throw new Error("Please sign in again.");
  const response = await fetch("/api/orders/purchase", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Supplier request failed.");
  return result;
}

function date(value: string | null) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString() : "Not provided by supplier";
}
function money(value: number | null) { return value == null ? "Unavailable" : `$${value.toFixed(2)}`; }

export default function CustomerOrderPurchase({ order, onClose, onComplete }: { order: Order; onClose: () => void; onComplete: (details: PurchaseDetails) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [supplier, setSupplier] = useState("USAF");
  const [lineCode, setLineCode] = useState("");
  const [lookupLineCode, setLookupLineCode] = useState("");
  const [branch, setBranch] = useState("");
  const [product, setProduct] = useState("");
  const [preview, setPreview] = useState<PurchaseDetails | null>(null);
  const [completed, setCompleted] = useState<PurchaseDetails | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [placing, setPlacing] = useState(false);
  const inFlight = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const supplierLabel = supplier === "USAF" ? "U.S. AutoForce" : "ATD";
  const selectedProduct = products.find(item => item.atdProductNumber === product && (supplier !== "USAF" || item.lineCode === lineCode));

  useEffect(() => {
    let active = true;
    closeButton.current?.focus();
    setBusy(true); setError(""); setPreview(null); setProducts([]); setProduct(""); setBranch("");
    purchaseApi({ action: "configuration" }).then(configuration => {
      if (!active) return null;
      setSandbox(!configuration.connections[supplier].production);
      return purchaseApi({ action: "search", orderId: order.id, supplier, lineCode: lookupLineCode });
    }).then(result => {
      if (!active) return;
      if (!result) return;
      if (result.completed) {
        setCompleted(result.completed); setWarning(result.warning || ""); onComplete(result.completed);
      } else {
        setProducts(result.products || []); setSandbox(Boolean(result.sandbox));
        if (result.products?.length === 1) {
          const match: Product = result.products[0];
          setProduct(match.atdProductNumber); setLineCode(match.lineCode || "");
          setBranch(match.warehouses?.find(item => item.quantity >= order.qty)?.code || "");
          if (supplier === "USAF" && !match.warehouses?.length && match.lineCode && lookupLineCode !== match.lineCode) setLookupLineCode(match.lineCode);
        }
      }
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
    // The request is fixed for the lifetime of this dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, supplier, lookupLineCode]);

  async function submit(action: "preview" | "place") {
    if (inFlight.current || !product || completed) return;
    inFlight.current = true; setBusy(true); setPlacing(action === "place"); setError("");
    try {
      const result = await purchaseApi({ action, orderId: order.id, supplier, lineCode, branch, productNumber: product, expectedTotal: preview?.total, expectedPo: order.job_number, expectedQuantity: order.qty, expectedDeliveryDate: preview?.deliveryDate });
      if (result.completed) {
        setCompleted(result.completed); setWarning(result.warning || ""); onComplete(result.completed);
      } else { setPreview(result.preview); setSandbox(Boolean(result.sandbox)); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Supplier request failed.");
      if (action === "place") setPreview(null);
    } finally { inFlight.current = false; setBusy(false); setPlacing(false); }
  }

  return <div className="atd-order-overlay">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="customer-purchase-title" className="atd-order-dialog customer-order-purchase" onKeyDown={event => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key === "Tab") {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),input:not([disabled]),a[href]') || []);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="atd-order-head"><div><span>{order.customer}</span><h2 id="customer-purchase-title">Order tires for this request</h2><p>Job / PO: <strong>{order.job_number || "Missing"}</strong> · MO: {order.mo_number || "—"}</p></div><button ref={closeButton} type="button" onClick={onClose} disabled={busy} aria-label="Close order window">×</button></div>
      <div className="atd-order-policy"><strong>{order.qty} × {order.tire_size}</strong><span>Requested product #{order.tire_product_number || "Missing"}</span><span>The job number is sent to the supplier as the purchase order number. Tires ship to your Bolt Tire account address.</span></div>
      {error && <div role="alert" className="atd-order-error">{error}</div>}
      {completed ? <div className="atd-order-success" role="status"><strong>{completed.supplier} order confirmed</strong><span>Confirmation: {completed.confirmation}</span><span>Expected delivery: {date(completed.deliveryDate)}</span><span>Supplier and delivery details have been filled into the request. Approve &amp; Create Job will carry them into the job.</span>{warning && <p role="alert">{warning}</p>}<button type="button" onClick={onClose}>Done — return to Orders</button></div> : <>
        <label className="customer-order-purchase-field" style={{ marginTop: 16 }}>Supplier<select disabled={busy} value={supplier} onChange={event => { setLookupLineCode(""); setLineCode(""); setSupplier(event.target.value); setSandbox(false); }}><option value="USAF">U.S. AutoForce</option><option value="ATD">ATD</option></select></label>
        {busy && !preview && <p role="status">{placing ? `Submitting your order to ${supplierLabel}…` : "Checking the supplier…"}</p>}
        {sandbox && <p role="alert">{supplierLabel} is using test access. You can check the connection, but production access is required to place real orders.</p>}
        {!busy && !error && !products.length && <p>No exact {supplierLabel} match for this product number. Check the number or choose the other supplier.</p>}
        {products.length > 0 && <label className="customer-order-purchase-field" style={{ marginTop: 16 }}>Matching tire<select disabled={busy} value={product ? `${product}|${lineCode}` : ""} onChange={event => {
          const match = products.find(item => `${item.atdProductNumber}|${item.lineCode || ""}` === event.target.value);
          setProduct(match?.atdProductNumber || ""); setLineCode(match?.lineCode || ""); setPreview(null); setError("");
          setBranch(match?.warehouses?.find(item => item.quantity >= order.qty)?.code || "");
          if (supplier === "USAF" && match?.lineCode && !match.warehouses?.length && lookupLineCode !== match.lineCode) setLookupLineCode(match.lineCode);
        }}><option value="">Choose a tire</option>{products.map(item => <option key={`${item.atdProductNumber}|${item.lineCode || ""}`} value={`${item.atdProductNumber}|${item.lineCode || ""}`}>{item.brand} {item.model} · {item.size} {item.loadSpeed} · #{item.atdProductNumber} · {money(item.cost ?? null)} each</option>)}</select></label>}
        {supplier === "USAF" && selectedProduct && <label className="customer-order-purchase-field" style={{ marginTop: 16 }}>Warehouse<select disabled={busy} value={branch} onChange={event => { setBranch(event.target.value); setPreview(null); }}><option value="">Choose an available warehouse</option>{selectedProduct.warehouses?.map(item => <option key={item.code} value={item.code} disabled={item.quantity < order.qty}>{item.name}{item.local ? " — Local" : ""} · {item.quantity} available</option>)}</select></label>}
        {preview && <div className="atd-order-preview"><strong>{supplierLabel} {supplier === "USAF" ? "estimated total" : "total"}: {money(preview.total)}</strong><span>Quantity: {order.qty} · PO: {order.job_number}</span><span>Expected delivery of all tires: {date(preview.deliveryDate)}</span>{preview.message && <p>{preview.message}</p>}{preview.shipments.map((shipment, index) => <div className="atd-order-fulfillment" key={index}><strong>{shipment.quantity} tires · {shipment.warehouse || "Supplier warehouse"}</strong><span>{shipment.status} · {shipment.shipMethod}</span><span>Expected: {date(shipment.deliveryDate)}</span></div>)}<small>Delivery dates are supplier estimates. Clicking Place order submits this purchase to {supplierLabel}.</small></div>}
        <div className="atd-order-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button>{preview ? <button type="button" className="place" disabled={busy || preview.total == null || sandbox} onClick={() => submit("place")}>{placing ? "Placing order…" : `Place ${supplierLabel} order · ${money(preview.total)}`}</button> : <button type="button" disabled={busy || !product || (supplier === "USAF" && !branch)} onClick={() => submit("preview")}>{busy ? "Please wait…" : "Review price & delivery"}</button>}</div>
      </>}
    </section>
  </div>;
}
