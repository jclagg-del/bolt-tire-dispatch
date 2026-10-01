"use client";

import { createPortal } from "react-dom";

export type TireLabelJob = {
  id: string;
  customer?: string | null;
  facilityName?: string | null;
  jobNumber?: string | null;
  moNumber?: string | null;
  serviceType?: string | null;
  tires?: string | null;
  size?: string | null;
  productNumber?: string | null;
  quantity?: number | null;
  vehicle?: string | null;
  scheduled?: string | null;
};

function scheduledDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function TireLabelPrint({ job }: { job: TireLabelJob | null }) {
  if (!job || typeof document === "undefined") return null;
  const quantity = Math.max(1, Math.min(24, Math.floor(Number(job.quantity) || 1)));
  const service = String(job.serviceType || "Tire Service").toUpperCase();
  const tire = [job.tires, job.size].filter(Boolean).join(" • ") || "Tire information not entered";

  // A direct child of body lets print CSS remove the entire app from layout.
  // visibility:hidden left the long receiving list occupying blank print pages.
  // Keep this synchronous: callers flushSync before opening iOS AirPrint.
  return createPortal(
    <div className="tire-label-print-root" aria-hidden="true">
      <style media="print">{"@page { size: 4in 6in; margin: 0.15in; }"}</style>
      {Array.from({ length: quantity }, (_, index) => (
        <section className="tire-receiving-label" key={index}>
          <header>
            <strong>BOLT TIRE</strong>
            <span>{service}</span>
          </header>
          <div className="tire-label-job-number">
            <small>JOB NUMBER</small>
            <b>{job.jobNumber || String(job.id).slice(0, 12)}</b>
          </div>
          <div className="tire-label-grid">
            <div><small>MO NUMBER</small><strong>{job.moNumber || "—"}</strong></div>
            <div><small>LABEL</small><strong>{index + 1} OF {quantity}</strong></div>
          </div>
          <div className="tire-label-tire">
            <small>TIRE</small>
            <strong>{tire}</strong>
            {job.productNumber ? <span>Product #: {job.productNumber}</span> : null}
          </div>
          <div className="tire-label-grid tire-label-bottom">
            <div><small>CUSTOMER / FACILITY</small><strong>{job.facilityName || job.customer || "—"}</strong></div>
            <div><small>SERVICE DATE</small><strong>{scheduledDate(job.scheduled) || "—"}</strong></div>
          </div>
          {job.vehicle ? <p>{job.vehicle}</p> : null}
        </section>
      ))}
    </div>,
    document.body,
  );
}
