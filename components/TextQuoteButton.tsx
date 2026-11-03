"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { quoteTextRecipient } from "@/lib/quote-sharing";
import type { QuoteTextPreview } from "@/lib/quote-text";

export default function TextQuoteButton({ quote, disabled, onMessage }: {
  quote: { id: string; public_token: string; quote_number: number; contact_name?: string | null; phone?: string | null };
  disabled?: boolean;
  onMessage: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const canText = Boolean(quote.id && quote.public_token && quoteTextRecipient(quote.phone));
  return <>
    <button type="button" className="quote-primary" disabled={disabled || !canText} onClick={() => setOpen(true)} title={canText ? "Preview and send a text through Bolt Tire’s Quo number" : "Save a valid customer phone number before texting"}>Text Quote</button>
    {open && <QuoteTextDialog quoteId={quote.id} onClose={() => setOpen(false)} onMessage={onMessage} />}
  </>;
}

export function QuoteTextDialog({ quoteId, onClose, onMessage }: { quoteId: string; onClose: () => void; onMessage: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [preview, setPreview] = useState<QuoteTextPreview | null>(null);
  const [error, setError] = useState(""), [sending, setSending] = useState(false), [sent, setSent] = useState(false), [resend, setResend] = useState(false);
  const [attempted, setAttempted] = useState(false);
  async function request(method: "GET" | "POST", body?: unknown) {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`/api/quotes/text?quoteId=${encodeURIComponent(quoteId)}`, { method, cache: "no-store", headers: { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not confirm the texting result. Close and review again; check Quo before resending.");
    return result;
  }
  useEffect(() => {
    let canceled = false;
    const element = dialog.current; element?.showModal();
    request("GET").then(result => { if (!canceled) setPreview(result); }).catch(reason => { if (!canceled) setError(reason.message); });
    return () => { canceled = true; element?.close(); };
  }, [quoteId]);
  async function send() {
    if (!preview || lock.current || attempted || preview.blockedReason || (preview.previous?.status === "accepted" && !resend)) return;
    lock.current = true; setSending(true); setAttempted(true); setError("");
    try {
      const result = await request("POST", { quoteId, fingerprint: preview.fingerprint, resend });
      if (result.accepted !== true) throw new Error("Could not confirm acceptance. Check Quo before resending.");
      setSent(true);
      onMessage(`Quote text submitted to Quo for ${result.recipient}. Delivery status is available in Quo.`);
      if (result.warning) setError(result.warning);
    } catch (reason) {
      setError(reason instanceof Error ? `${reason.message} If the connection dropped, check Quo before resending.` : "Could not confirm the result. Check Quo before resending.");
    } finally { lock.current = false; setSending(false); }
  }
  const needsResend = preview?.previous?.status === "accepted";
  const canSend = Boolean(preview && !sending && !attempted && !preview.blockedReason && (!needsResend || resend));
  return <dialog ref={dialog} aria-labelledby="text-quote-title" onCancel={event => { event.preventDefault(); if (!lock.current) onClose(); }} style={{ width: "min(520px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 40px)", overflowY: "auto", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 18, padding: 24, color: "#0f172a", boxShadow: "0 20px 60px #0004" }}>
    <h2 id="text-quote-title" style={{ marginTop: 0 }}>Text quote{preview ? ` #${preview.quoteNumber}` : ""}</h2>
    {error && <p role="alert" style={{ color: "#b91c1c", lineHeight: 1.5 }}>{error}</p>}
    {!preview && !error && <p role="status">Checking the saved quote and Quo connection…</p>}
    {preview && <>
      <p><strong>{preview.customer}</strong><br />To: <strong>{preview.recipient}</strong><br />From: Bolt Tire · {preview.sender}</p>
      <div aria-label="Message preview" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", borderRadius: 12, padding: 16, background: "#eff6ff", lineHeight: 1.6 }}>{preview.content}</div>
      {sent ? <p role="status" style={{ color: "#166534" }}>Submitted to Quo. Check the conversation there for delivery status and replies.</p> : <>
        <p style={{ color: "#475569", fontSize: 14 }}>Nothing is sent until you press Send text. To change the recipient, edit and save the quote first. Quo API messaging credits apply.</p>
        {preview.blockedReason && <p role="alert" style={{ color: "#b45309" }}>{preview.blockedReason}</p>}
        {needsResend && <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16 }}><input type="checkbox" checked={resend} disabled={sending || attempted} onChange={event => setResend(event.target.checked)} />This quote was already submitted to Quo on {new Date(preview.previous!.requested_at).toLocaleString()}. Send it again.</label>}
      </>}
    </>}
    <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
      <button type="button" disabled={sending} onClick={onClose} style={{ ...button, background: "#e2e8f0", color: "#0f172a" }}>{sent || attempted ? "Done" : "Cancel"}</button>
      {!sent && <button type="button" disabled={!canSend} onClick={send} style={{ ...button, background: "#2563eb", color: "white", opacity: canSend ? 1 : .6 }}>{sending ? "Sending…" : "Send text"}</button>}
    </div>
  </dialog>;
}
const button = { flex: 1, minHeight: 44, border: 0, borderRadius: 10, padding: "12px 16px", fontWeight: 700, cursor: "pointer" };
