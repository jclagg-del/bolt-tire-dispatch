"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import TireLabelPrint, { type TireLabelJob } from "./TireLabelPrint";

export default function WifiLabelButton({ job, disabled, style }: {
  job: TireLabelJob;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [printJob, setPrintJob] = useState<TireLabelJob | null>(null);
  const [open, setOpen] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);
  useEffect(() => {
    const clear = () => setPrintJob(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  function nativePrint(snapshot: TireLabelJob) {
    // Mount and fit every label before opening the native print dialog.
    // Keep this in the click gesture so iPhone Safari can open AirPrint.
    flushSync(() => setPrintJob(snapshot));
    try { window.print(); }
    catch { setPrintJob(null); }
    // A returned call (or afterprint) does not confirm printing. Keep the
    // fallback open even when iPhone silently ignores window.print().
  }

  async function preparePdf(snapshot: TireLabelJob) {
    const current = ++request.current;
    setPdf(null); setError("");
    try {
      const { tireLabelPdf } = await import("@/lib/tire-label-pdf");
      const bytes = await tireLabelPdf(snapshot, 80);
      if (current !== request.current) return;
      setPdf({ url: URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" })), filename: "bolt-tire-labels.pdf" });
    } catch (e) {
      if (current === request.current) setError(e instanceof Error ? e.message : "Labels could not be prepared. Please retry.");
    }
  }

  function print() {
    const snapshot = { ...job };
    flushSync(() => setOpen(true));
    void preparePdf(snapshot);
    nativePrint(snapshot);
  }

  function close() {
    request.current++;
    setOpen(false); setPrintJob(null); setPdf(null); setError("");
    trigger.current?.focus();
  }

  return <>
    <button ref={trigger} type="button" disabled={disabled} style={style} onClick={print}>Print via Wi-Fi</button>
    <TireLabelPrint job={printJob} />
    {open && createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "#0f172a99", display: "grid", placeItems: "center", padding: 16 }} onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Print labels via Wi-Fi" style={{ background: "white", color: "#111827", borderRadius: 18, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90dvh", overflowY: "auto", boxSizing: "border-box" }}>
        <h2 style={{ marginTop: 0 }}>Print via Wi-Fi</h2>
        <p>If the print screen didn’t open, tap <strong>Open labels</strong> below, then use your iPhone’s <strong>Share → Print</strong>.</p>
        <p>Keep your phone and AirPrint printer on the same Wi-Fi network. Use 4 × 6 paper and one copy. Each tire already has its own page.</p>
        {!pdf && !error && <p role="status">Preparing label PDF…</p>}
        {error && <><p role="alert">{error}</p><button type="button" onClick={() => void preparePdf({ ...job })}>Retry preparing labels</button></>}
        {pdf && <>
          <p><a autoFocus href={pdf.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: 14, background: "#2563eb", color: "white", textAlign: "center", borderRadius: 10, fontWeight: 800 }}>Open labels</a></p>
          <p><a href={pdf.url} download={pdf.filename}>Save label PDF</a></p>
          <p style={{ fontSize: 13 }}>The PDF uses the 80% label size you requested, on 4 × 6 pages. If the app icon won’t open it, open Bolt Tire in Safari and try again.</p>
        </>}
        <button type="button" onClick={() => nativePrint({ ...job })} style={{ padding: 10 }}>Try print dialog again</button>{" "}
        <button type="button" onClick={close} style={{ padding: 10 }}>Close</button>
      </section>
    </div>, document.body)}
  </>;
}
