"use client";

import { useId } from "react";
import { wheelTorqueError } from "@/lib/job-completion";

export default function WheelTorqueInput({ value, onChange, disabled = false }: {
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const error = wheelTorqueError(value);
  return <div style={{ marginTop: 8 }}>
    <label htmlFor={id} style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>
      Wheel torque (ft-lb) <span style={{ fontWeight: 400 }}>(optional)</span>
    </label>
    <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value}
      disabled={disabled} onChange={event => onChange(event.target.value)}
      placeholder="Enter applied torque" aria-invalid={!!error} aria-describedby={`${id}-help`}
      style={{ boxSizing: "border-box", width: "100%", minHeight: 44, padding: 12, border: `1px solid ${error ? "#dc2626" : "#cbd5e1"}`, borderRadius: 10, fontSize: 16, color: "#111827", background: "white" }} />
    <p id={`${id}-help`} role={error ? "alert" : undefined} style={{ margin: "6px 0 12px", fontSize: 13, color: error ? "#b91c1c" : "#475569" }}>
      {error || "Record the torque actually applied, in foot-pounds."}
    </p>
  </div>;
}
