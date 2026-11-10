"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { moveRouteStop } from "@/lib/route-order";

type Stop = { id: string | number; customer?: string | null; po_number?: string | null };
type Target = { id: string; after: boolean; vehicleId?: never } | { vehicleId: string; id?: never; after?: never };

export default function RouteStopList<T extends Stop>({ jobs, disabled, onReorder, renderJob, vehicleId, transferVehicles = [], onTransfer, onTransferHover }: {
  jobs: T[]; disabled: boolean; onReorder: (ids: string[], movedId: string, targetId: string) => void; renderJob: (job: T, index: number) => ReactNode;
  vehicleId?: string; transferVehicles?: { id: string; name: string }[];
  onTransfer?: (jobId: string, vehicleId: string) => void;
  onTransferHover?: (vehicleId: string | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: string; x: number; y: number; currentY: number; currentX: number; active: boolean; target: Target | null } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const ids = jobs.map(job => String(job.id));

  const destinations = transferVehicles.filter(vehicle => vehicle.id !== vehicleId);
  function cancel() { gesture.current = null; setDragging(null); setTarget(null); onTransferHover?.(null); }
  function locate(x: number, y: number) {
    const hit = document.elementFromPoint(x, y);
    const column = hit?.closest<HTMLElement>("[data-route-vehicle]");
    if (onTransfer && column && root.current?.closest("[data-route-board]")?.contains(column)
      && column.dataset.routeDropEnabled === "true" && column.dataset.routeVehicle !== vehicleId
      && destinations.some(vehicle => vehicle.id === column.dataset.routeVehicle)) {
      return { vehicleId: column.dataset.routeVehicle! };
    }
    const element = hit?.closest<HTMLElement>("[data-route-stop]");
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
          onTransferHover?.(current.target?.vehicleId || null);
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
    if (destination.vehicleId) { onTransfer?.(source, destination.vehicleId); return; }
    if (!destination.id) return;
    const next = moveRouteStop(ids, source, destination.id, destination.after);
    if (next.some((id, index) => id !== ids[index])) onReorder(next, source, destination.id);
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 5 }}>
          <button type="button" aria-label={`Drag ${label} to reorder${onTransfer ? " or move to another vehicle" : ""}; arrow keys also move this stop`} disabled={disabled || (jobs.length < 2 && (!onTransfer || !destinations.length))}
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
              onTransferHover?.(current.target?.vehicleId || null);
            }}
            onPointerUp={event => {
              const current = gesture.current;
              const destination = current?.active ? locate(event.clientX, event.clientY) : null;
              cancel();
              if (current) move(current.id, destination);
            }}
            onPointerCancel={cancel} onLostPointerCapture={cancel}
          >⠿ {onTransfer ? "Drag to move" : "Drag to reorder"}</button>
          <button type="button" style={control} aria-label={`Move ${label} up`} disabled={disabled || index === 0} onClick={() => step(index, -1)}>↑</button>
          <button type="button" style={control} aria-label={`Move ${label} down`} disabled={disabled || index === jobs.length - 1} onClick={() => step(index, 1)}>↓</button>
          {onTransfer && destinations.length > 0 ? <select aria-label={`Move ${label} to another vehicle`} value="" disabled={disabled}
            style={{ ...control, width: "100%" }} onChange={event => { if (!disabled && event.target.value) onTransfer(id, event.target.value); }}>
            <option value="">Move to vehicle…</option>
            {destinations.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
          </select> : null}
        </div>
        {renderJob(job, index)}
      </div>;
    })}
  </div>;
}

const control = { minHeight: 44, minWidth: 44, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155", fontSize: 14, fontWeight: 700 };
