"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type CompletionTextJob = {
  id: string | number;
  complete?: boolean | null;
  customer?: string | null;
  phone?: string | null;
  review_request_sent_at?: string | null;
};

export default function CompletionTextButton({ job }: { job: CompletionTextJob }) {
  const sendingLock = useRef(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  if (!job.complete || job.customer === "Kingdom Support Services" || job.customer === "HPR") return null;
  const alreadySent = sent || Boolean(job.review_request_sent_at);
  const digits = String(job.phone || "").replace(/\D/g, "");
  const validPhone = digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));

  async function send() {
    if (sendingLock.current || alreadySent || !validPhone) return;
    if (!window.confirm(`Send the completion / thank-you text and review links to ${job.phone}?`)) return;
    sendingLock.current = true;
    setSending(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Please sign in again before sending.");
      const response = await fetch("/api/notifications/job-completed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ jobId: job.id, mode: "review_text" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The completion text could not be sent.");
      if (result.review?.sent !== true) {
        const reason = result.review?.reason || result.reason;
        throw new Error(reason === "no-valid-phone" ? "Save a valid customer phone number first." :
          reason === "quo-not-connected" ? "Text messaging is not connected. Please check Settings." :
          "The text was not sent. Refresh the job and confirm it is completed.");
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm sending. Check Quo before trying again.");
    } finally {
      sendingLock.current = false; setSending(false);
    }
  }

  return <div onClick={event => event.stopPropagation()} style={{ maxWidth: 300 }}>
    <button type="button" onClick={send} disabled={sending || alreadySent || !validPhone}
      style={{ minHeight: 44, padding: "10px 14px", borderRadius: 9, border: "1px solid #cbd5e1", background: alreadySent ? "#ecfdf5" : "#111827", color: alreadySent ? "#166534" : "white", fontWeight: 700, cursor: sending || alreadySent || !validPhone ? "default" : "pointer", opacity: !validPhone && !alreadySent ? 0.6 : 1 }}>
      {alreadySent ? "Text sent" : sending ? "Sending…" : "Send completion text"}
    </button>
    {!validPhone && !alreadySent && <div style={{ fontSize: 12, marginTop: 4 }}>Add a valid phone number in Edit Job.</div>}
    {sent && <div role="status" style={{ color: "#166534", fontSize: 12, marginTop: 4 }}>Completion text sent.</div>}
    {error && <div role="alert" style={{ color: "#b91c1c", fontSize: 13, marginTop: 4 }}>{error}</div>}
  </div>;
}
