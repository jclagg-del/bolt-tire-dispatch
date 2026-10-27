"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TireLabelJob } from "./TireLabelPrint";

type Prepared = { key: string; url: string; href: string; count: number };

export default function PrintLabelsButton({ job, disabled, style }: {
  job: TireLabelJob; disabled?: boolean; style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(80);
  const [gap, setGap] = useState("3");
  const [retry, setRetry] = useState(0);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [launchError, setLaunchError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const key = JSON.stringify({ job, scale, gap });
  const ready = prepared?.key === key ? prepared : null;
  const error = failure?.key === key ? failure.message : "";

  // Prepare before the tap: launching another iPhone app must stay in the
  // user's click gesture, not after a PDF generation/import promise resolves.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setPrepared(null); setFailure(null);
    const snapshot = JSON.parse(key) as { job: TireLabelJob; scale: number; gap: string };
    async function prepare() {
      try {
        const gapMm = Number(snapshot.gap);
        if (!snapshot.gap.trim() || !Number.isFinite(gapMm) || gapMm < 0 || gapMm > 10) throw new Error("Enter a label gap from 0 to 10 mm.");
        const { tireLabelPdf, smoothPrintUrl, labelCount } = await import("@/lib/tire-label-pdf");
        const bytes = await tireLabelPdf(snapshot.job, snapshot.scale);
        if (cancelled) return;
        const href = smoothPrintUrl(bytes, `bolt-labels-${crypto.randomUUID()}.pdf`, gapMm);
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
        setPrepared({ key, href, url: objectUrl, count: labelCount(snapshot.job.quantity) });
      } catch (e) {
        if (!cancelled) setFailure({ key, message: e instanceof Error ? e.message : "Labels could not be prepared. Please retry." });
      }
    }
    void prepare();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, retry]);

  function print() {
    setOpen(true); setLaunchError("");
    if (!ready || disabled) return;
    try { window.location.assign(ready.href); }
    catch { setLaunchError("Smooth Print could not open. Check that Brother Smooth Print is installed, then try again."); }
  }
  function close() { setOpen(false); trigger.current?.focus(); }

  return <>
    <button ref={trigger} type="button" style={style} disabled={disabled || (!ready && !error)} aria-busy={!ready && !error} onClick={print}>Print labels</button>
    {!ready && !error && <span role="status" style={{ fontSize: 12 }}>Preparing labels…</span>}
    {error && !open && <span role="alert" style={{ fontSize: 12 }}>Labels need attention. Tap Print labels.</span>}
    {open && createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "#0f172a99", display: "grid", placeItems: "center", padding: 16 }} onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Print labels" style={{ background: "white", color: "#111827", borderRadius: 18, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90dvh", overflowY: "auto", boxSizing: "border-box" }}>
        <h2 style={{ marginTop: 0 }}>Print labels</h2>
        <p>Allow your iPhone to open <strong>Brother Smooth Print</strong>. It uses the Wi-Fi or Bluetooth printer selected in Smooth Print.</p>
        <p>Turn the printer on and connect it in Smooth Print first. Confirm the print result there; returning to Bolt Tire does not confirm that labels printed.</p>
        {launchError && <p role="alert">{launchError}</p>}
        {error && <><p role="alert">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry preparing labels</button></>}
        {!ready && !error && <p role="status">Preparing labels…</p>}
        {ready && <>
          <p>{ready.count} label{ready.count === 1 ? "" : "s"} · 4 × 6 inches · {scale}% size</p>
          <p><a href={ready.href}>Open Smooth Print again</a></p>
          <p><a href={ready.url} target="_blank" rel="noopener noreferrer">Backup label PDF</a></p>
        </>}
        <details><summary>Print settings</summary>
          <label>Label size<select value={scale} onChange={e => setScale(Number(e.target.value))} style={{ display: "block", padding: 10, marginBottom: 12 }}>{[75,80,90,100].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
          <label>Gap between labels (mm)<input type="number" min="0" max="10" step="0.1" value={gap} onChange={e => setGap(e.target.value)} style={{ display: "block", padding: 10, width: "100%", boxSizing: "border-box" }} /></label>
        </details>
        <button autoFocus type="button" onClick={close} style={{ padding: "10px 16px", marginTop: 16 }}>Close</button>
      </section>
    </div>, document.body)}
  </>;
}
