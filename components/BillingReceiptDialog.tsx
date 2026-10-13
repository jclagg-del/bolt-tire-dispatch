"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { BillingReceipt } from "@/lib/billing-receipt";

export default function BillingReceiptDialog({ jobId, onClose, onSent }: { jobId: string | number; onClose: () => void; onSent: (email: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), sendingLock = useRef(false);
  const [preview, setPreview] = useState<{ receipt: BillingReceipt; fingerprint: string } | null>(null);
  const [error, setError] = useState(""), [sending, setSending] = useState(false);
  async function request(method: "GET" | "POST", body?: unknown) {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`/api/billing/receipts?jobId=${encodeURIComponent(jobId)}`, { method, cache: "no-store",
      headers: { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Receipt could not be sent.");
    return result;
  }
  useEffect(() => {
    let canceled = false;
    const element = dialog.current;
    element?.showModal();
    request("GET").then(result => { if (!canceled) setPreview(result); }).catch(reason => { if (!canceled) setError(reason.message); });
    return () => { canceled = true; element?.close(); };
  }, [jobId]);
  async function send() {
    if (!preview || sendingLock.current) return;
    sendingLock.current = true; setSending(true); setError("");
    try { const result = await request("POST", { jobId, fingerprint: preview.fingerprint }); onSent(result.email); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Receipt could not be sent. Please retry."); }
    finally { sendingLock.current = false; setSending(false); }
  }
  return <dialog ref={dialog} aria-labelledby="receipt-title" onCancel={event => { event.preventDefault(); if (!sendingLock.current) onClose(); }}
    style={{ width: "min(480px, calc(100vw - 32px))", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 18, padding: 24, color: "#0f172a", boxShadow: "0 20px 60px #0004" }}>
    <h2 id="receipt-title" style={{ marginTop: 0 }}>Send payment receipt</h2>
    {error && <p role="alert" style={{ color: "#b91c1c", lineHeight: 1.5 }}>{error}</p>}
    {!preview && !error && <p role="status">Verifying payment…</p>}
    {preview && <>
      <p><strong>{preview.receipt.customer}</strong><br />{preview.receipt.reference}</p>
      <p>Send to: <strong style={{ overflowWrap: "anywhere" }}>{preview.receipt.email}</strong></p>
      <p style={{ fontSize: 24, fontWeight: 800 }}>{(preview.receipt.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} paid</p>
      <p>{preview.receipt.source === "Stripe" ? "Includes a link to the official Stripe receipt." : preview.receipt.source === "QuickBooks" ? "Based on the paid invoice verified in QuickBooks." : "Based on the job’s recorded paid status and total."}</p>
      <p style={{ color: "#475569", lineHeight: 1.5 }}>This emails a receipt only. It does not charge the customer or create another invoice. To change the recipient, update the job’s email first.</p>
    </>}
    <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
      <button type="button" disabled={sending} onClick={onClose} style={{ ...button, background: "#e2e8f0", color: "#0f172a" }}>Cancel</button>
      <button type="button" disabled={!preview || sending} onClick={send} style={{ ...button, background: "#2563eb", color: "white", opacity: preview && !sending ? 1 : .6 }}>{sending ? "Sending…" : "Send receipt"}</button>
    </div>
  </dialog>;
}
const button = { flex: 1, minHeight: 44, border: 0, borderRadius: 10, padding: "12px 16px", fontWeight: 700, cursor: "pointer" };
