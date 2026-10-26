"use client";

import { createPortal } from "react-dom";
import { useLayoutEffect, useRef } from "react";

// Fit the complete block, not individual fields. Keep the same physical geometry
// on screen and in print so flushSync can measure it before iOS opens AirPrint.
export function fitTireLabels(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".tire-receiving-label").forEach(label => {
    const content = label.querySelector<HTMLElement>(".tire-label-content");
    if (!content) return;
    const scale = Math.min(1, (label.clientWidth - 2) / Math.max(content.scrollWidth, 1), (label.clientHeight - 2) / Math.max(content.scrollHeight, 1));
    content.style.transform = `scale(${scale})`;
    content.style.left = `${Math.max(0, (label.clientWidth - Math.max(content.offsetWidth, content.scrollWidth) * scale) / 2)}px`;
  });
}

export type TireLabelJob = {
  id: string;
  customer?: string | null;
  facilityName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
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
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => { if (root.current) fitTireLabels(root.current); };
    fit();
    window.addEventListener("beforeprint", fit);
    return () => window.removeEventListener("beforeprint", fit);
  }, [job]);
  if (!job || typeof document === "undefined") return null;
  const quantity = Math.max(1, Math.min(24, Math.floor(Number(job.quantity) || 1)));
  const service = String(job.serviceType || "Tire Service").toUpperCase();
  const tire = [job.tires, job.size].filter(Boolean).join(" • ") || "Tire information not entered";

  // A direct child of body lets print CSS remove the entire app from layout.
  // visibility:hidden left the long receiving list occupying blank print pages.
  // Keep this synchronous: callers flushSync before opening iOS AirPrint.
  return createPortal(
    <div className="tire-label-print-root" aria-hidden="true" ref={root}>
      <style media="print">{"@page { size: 4in 6in; margin: 0.15in; }"}</style>
      {Array.from({ length: quantity }, (_, index) => (
        <section className="tire-receiving-label" key={index}>
          <div className="tire-label-content">
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
            <div><small>FACILITY</small><strong>{job.facilityName?.trim() || "Facility not set"}</strong></div>
            <div><small>SERVICE DATE</small><strong>{scheduledDate(job.scheduled) || "—"}</strong></div>
          </div>
          <p><small>CONTACT</small><br/><strong>{job.contactName?.trim() || (!job.facilityName?.trim() ? job.customer?.trim() : "") || "Contact not set"}</strong></p>
          <p><small>SERVICE ADDRESS</small><br/>{job.address?.trim() || "Address not set"}</p>
          <p>{job.phone?.trim() || "Phone not set"}{job.email?.trim() ? <><br/>{job.email.trim()}</> : null}</p>
          {job.vehicle ? <p>{job.vehicle}</p> : null}
          </div>
        </section>
      ))}
    </div>,
    document.body,
  );
}
