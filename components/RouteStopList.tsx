"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { moveRouteStop } from "@/lib/route-order";

type Stop = { id: string | number; customer?: string | null; po_number?: string | null };
type Target = { id: string; after: boolean };

export default function RouteStopList<T extends Stop>({ jobs, disabled, onReorder, renderJob }: {
  jobs: T[]; disabled: boolean; onReorder: (ids: string[]) => void; renderJob: (job: T, index: number) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: string; x: number; y: number; currentY: number; currentX: number; active: boolean; target: Target | null } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const ids = jobs.map(job => String(job.id));

  function cancel() { gesture.current = null; setDragging(null); setTarget(null); }
  function locate(x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-route-stop]");
    if (!element || !root.current?.contains(element)) return null;
    const rect = element.getBoundingClientRect();
    return { id: element.dataset.routeStop!, after: y > rect.top + rect.height / 2 };
  }
  useEffect(() => {
    if (!dragging) return;
    let frame: number;
    function tick() {
      const current = gesture.current;
      if (current?.active) {
        const y = current.currentY;
        const speed = y < 100 ? -12 : y > window.innerHeight - 90 ? 12 : 0;
        if (speed) {
          window.scrollBy(0, speed);
          current.target = locate(current.currentX, y);
          setTarget(current.target);
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", escape);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", escape); };
  }, [dragging]);
  useEffect(() => { if (disabled) cancel(); }, [disabled]);

  function move(source: string, destination: Target | null) {
    if (disabled || !destination) return;
    const next = moveRouteStop(ids, source, destination.id, destination.after);
    if (next.some((id, index) => id !== ids[index])) onReorder(next);
  }
  function step(index: number, direction: -1 | 1) {
    if (index + direction < 0 || index + direction >= ids.length) return;
    move(ids[index], { id: ids[index + direction], after: direction === 1 });
  }

  return <div ref={root} style={{ display: "grid", gap: 12 }}>
    {jobs.map((job, index) => {
      const id = String(job.id);
      const label = `job ${job.po_number || job.id}`;
      const marked = dragging !== id && target?.id === id;
      return <div key={id} data-route-stop={id} style={{ minWidth: 0, opacity: dragging === id ? 0.55 : 1, borderTop: `4px solid ${marked && !target?.after ? "#2563eb" : "transparent"}`, borderBottom: `4px solid ${marked && target?.after ? "#2563eb" : "transparent"}` }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
          <button type="button" aria-label={`Drag ${label} to reorder; arrow keys also move this stop`} disabled={disabled || jobs.length < 2}
            style={{ ...control, flex: 1, touchAction: "none", cursor: dragging === id ? "grabbing" : "grab", userSelect: "none" }}
            onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); step(index, event.key === "ArrowUp" ? -1 : 1); } }}
            onPointerDown={event => {
              if (disabled || !event.isPrimary || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              gesture.current = { id, x: event.clientX, y: event.clientY, currentX: event.clientX, currentY: event.clientY, active: false, target: null };
            }}
            onPointerMove={event => {
              const current = gesture.current;
              if (!current || current.id !== id) return;
              current.currentX = event.clientX; current.currentY = event.clientY;
              if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
              current.active = true;
              current.target = locate(event.clientX, event.clientY);
              setDragging(id); setTarget(current.target);
            }}
            onPointerUp={event => {
              const current = gesture.current;
              const destination = current?.active ? locate(event.clientX, event.clientY) : null;
              cancel();
              if (current) move(current.id, destination);
            }}
            onPointerCancel={cancel} onLostPointerCapture={cancel}
          >⠿ Drag to reorder</button>
          <button type="button" style={control} aria-label={`Move ${label} up`} disabled={disabled || index === 0} onClick={() => step(index, -1)}>↑</button>
          <button type="button" style={control} aria-label={`Move ${label} down`} disabled={disabled || index === jobs.length - 1} onClick={() => step(index, 1)}>↓</button>
        </div>
        {renderJob(job, index)}
      </div>;
    })}
  </div>;
}

const control = { minHeight: 44, minWidth: 44, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155", fontSize: 14, fontWeight: 700 };
