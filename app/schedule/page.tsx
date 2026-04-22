"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

type Job = {
  id: string | number;
  customer?: string | null;
  vehicle?: string | null;
  vehicle_id?: string | null;
  unit_number?: string | null;
  address?: string | null;
  phone?: string | null;
  scheduled?: string | null;
  complete?: boolean | null;
  notes?: string | null;
  tires?: string | null;
  size?: string | null;
  qty?: string | number | null;
  service_type?: string | null;
  po_number?: string | null;
  job_total?: number | string | null;
  payment_status?: string | null;
  invoice_number?: string | null;
  job_status?: string | null;
  billing_name?: string | null;
};

const NY_TIMEZONE = "America/New_York";

function parseJobDate(input?: string | null) {
  if (!input) return null;

  const value = input.trim();
  if (!value) return null;

  const hasTimezone =
    value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);

  if (hasTimezone) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  const localValue = value.replace(" ", "T");
  const d = new Date(localValue);

  return isNaN(d.getTime()) ? null : d;
}

function getNYParts(input: string | Date) {
  const date =
    input instanceof Date ? input : parseJobDate(input) || new Date(input);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function getNYDateKey(input: string | Date) {
  const p = getNYParts(input);
  return `${p.year}-${p.month}-${p.day}`;
}

function formatDayHeader(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTimeNY(input?: string | null) {
  const date = parseJobDate(input);
  if (!date) return "Invalid time";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);

  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utcDate.getUTCDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getStartOfWeekNY(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    weekday: "short",
  }).format(date);

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const currentDay = dayMap[weekday] ?? 0;
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

  return addDaysToDateKey(getNYDateKey(date), mondayOffset);
}

function makeUTCISOStringFromNYLocal(
  dateKey: string,
  hour: number,
  minute: number
) {
  const [year, month, day] = dateKey.split("-").map(Number);

  const desiredSerial =
    Date.UTC(year, month - 1, day, hour, minute, 0, 0) / 60000;

  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  for (let i = 0; i < 4; i++) {
    const actual = getNYParts(guess);

    const actualSerial =
      Date.UTC(
        Number(actual.year),
        Number(actual.month) - 1,
        Number(actual.day),
        Number(actual.hour),
        Number(actual.minute),
        0,
        0
      ) / 60000;

    const diffMinutes = desiredSerial - actualSerial;

    if (diffMinutes === 0) break;

    guess = new Date(guess.getTime() + diffMinutes * 60000);
  }

  return guess.toISOString();
}

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return `$${num.toFixed(2)}`;
}

export default function SchedulePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [weekStart, setWeekStart] = useState(() => getStartOfWeekNY(new Date()));
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [moveModeJobId, setMoveModeJobId] = useState<string | null>(null);
  const router = useRouter();

  const fetchJobs = async () => {
    setLoading(true);
    setErrorText("");

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        customer,
        vehicle,
        vehicle_id,
        unit_number,
        address,
        phone,
        scheduled,
        complete,
        notes,
        tires,
        size,
        qty,
        service_type,
        po_number,
        job_total,
        payment_status,
        invoice_number,
        job_status,
        billing_name
      `);

    if (error) {
      setErrorText(error.message);
      setJobs([]);
      setLoading(false);
      return;
    }

    setJobs((data as Job[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dateKey = addDaysToDateKey(weekStart, i);
      const date = new Date(`${dateKey}T12:00:00`);

      return {
        dateKey,
        label: formatDayHeader(date),
      };
    });
  }, [weekStart]);

  const jobsByDay = useMemo(() => {
    const grouped: Record<string, Job[]> = {};

    for (const day of weekDays) {
      grouped[day.dateKey] = [];
    }

    for (const job of jobs) {
      if (!job.scheduled || job.complete) continue;

      const dateKey = getNYDateKey(job.scheduled);

      if (grouped[dateKey]) {
        grouped[dateKey].push(job);
      }
    }

    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) =>
        (a.scheduled || "").localeCompare(b.scheduled || "")
      );
    }

    return grouped;
  }, [jobs, weekDays]);

  const moveJobToDay = async (jobId: string, targetDateKey: string) => {
    const currentJob = jobs.find((job) => String(job.id) === String(jobId));

    if (!currentJob || !currentJob.scheduled) return;

    const currentDateKey = getNYDateKey(currentJob.scheduled);
    if (currentDateKey === targetDateKey) {
      setMoveModeJobId(null);
      return;
    }

    setErrorText("");

    const timeParts = getNYParts(currentJob.scheduled);
    const newScheduled = makeUTCISOStringFromNYLocal(
      targetDateKey,
      Number(timeParts.hour),
      Number(timeParts.minute)
    );

    const previousJobs = jobs;

    setJobs((prev) =>
      prev.map((job) =>
        String(job.id) === String(jobId)
          ? { ...job, scheduled: newScheduled }
          : job
      )
    );

    setSaving(true);

    const { error } = await supabase
      .from("jobs")
      .update({ scheduled: newScheduled })
      .eq("id", currentJob.id);

    if (error) {
      setJobs(previousJobs);
      setErrorText(error.message || "Failed to move job.");
    }

    setSaving(false);
    setMoveModeJobId(null);
  };

  if (loading) {
    return (
      <div style={shell}>
        <AppHeader />
        <div style={spinnerPage}>
          <div style={spinner} />
          <div style={spinnerText}>Loading weekly schedule...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={headerWrap}>
          <div style={eyebrow}>Schedule</div>
          <h1 style={title}>Weekly Schedule</h1>
          <p style={subtitle}>
            Drag jobs on desktop or use Move on iPhone to shift them between days.
          </p>
        </div>

        {errorText ? <div style={errorBanner}>Error: {errorText}</div> : null}
        {saving ? <div style={savingBanner}>Saving schedule change...</div> : null}

        {moveModeJobId ? (
          <div style={moveBanner}>
            <div style={moveBannerText}>Tap a day column to move the selected job.</div>
            <button
              type="button"
              style={cancelMoveButton}
              onClick={() => setMoveModeJobId(null)}
            >
              Cancel
            </button>
          </div>
        ) : null}

        <div style={topBar}>
          <button
            type="button"
            onClick={() => setWeekStart((prev) => addDaysToDateKey(prev, -7))}
            style={navButton}
          >
            ← Previous Week
          </button>

          <button
            type="button"
            onClick={() => setWeekStart(getStartOfWeekNY(new Date()))}
            style={todayButton}
          >
            This Week
          </button>

          <button
            type="button"
            onClick={() => setWeekStart((prev) => addDaysToDateKey(prev, 7))}
            style={navButton}
          >
            Next Week →
          </button>
        </div>

        <div style={weekGrid}>
          {weekDays.map((day) => {
            const dayJobs = jobsByDay[day.dateKey] || [];
            const isDragOver = dragOverDateKey === day.dateKey;
            const isMoveTarget = moveModeJobId !== null;

            return (
              <div
                key={day.dateKey}
                style={{
                  ...dayColumn,
                  ...(isDragOver ? dayColumnActive : {}),
                  ...(isMoveTarget ? dayColumnMoveTarget : {}),
                }}
                onClick={async () => {
                  if (!moveModeJobId) return;
                  await moveJobToDay(moveModeJobId, day.dateKey);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverDateKey(day.dateKey);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverDateKey(day.dateKey);
                }}
                onDragLeave={() => {
                  setDragOverDateKey((current) =>
                    current === day.dateKey ? null : current
                  );
                }}
                onDrop={async (e) => {
                  e.preventDefault();

                  const droppedJobId = e.dataTransfer.getData("text/plain");

                  setDragOverDateKey(null);
                  setDraggingJobId(null);

                  if (!droppedJobId) return;

                  await moveJobToDay(droppedJobId, day.dateKey);
                }}
              >
                <div style={dayHeader}>
                  <div style={dayHeaderText}>{day.label}</div>
                  <div style={dayCount}>
                    {dayJobs.length} job{dayJobs.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div style={dayBody}>
                  {dayJobs.length > 0 ? (
                    dayJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        draggingJobId={draggingJobId}
                        moveModeJobId={moveModeJobId}
                        onDragStart={(id) => setDraggingJobId(String(id))}
                        onDragEnd={() => {
                          setDraggingJobId(null);
                          setDragOverDateKey(null);
                        }}
                        onOpenJob={(id) => router.push(`/jobs/${id}`)}
                        onPickForMove={(id) => {
                          setMoveModeJobId(String(id));
                        }}
                        onCancelMove={() => {
                          setMoveModeJobId(null);
                        }}
                      />
                    ))
                  ) : (
                    <div style={emptyDay}>
                      {moveModeJobId ? "Tap to move here" : "Drop job here"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function JobCard({
  job,
  draggingJobId,
  moveModeJobId,
  onDragStart,
  onDragEnd,
  onOpenJob,
  onPickForMove,
  onCancelMove,
}: {
  job: Job;
  draggingJobId: string | null;
  moveModeJobId: string | null;
  onDragStart: (id: string | number) => void;
  onDragEnd: () => void;
  onOpenJob: (id: string | number) => void;
  onPickForMove: (id: string | number) => void;
  onCancelMove: () => void;
}) {
  const phone = job.phone || "";
  const vehicleLabel =
    job.vehicle_id === "stepvan" ? "Stepvan" : "Service Truck";
  const vehicleColor =
    job.vehicle_id === "stepvan" ? "#2563eb" : "#facc15";
  const isDragging = draggingJobId === String(job.id);
  const isSelectedForMove = moveModeJobId === String(job.id);
  const total = formatMoney(job.job_total);
  const unitOrVehicle = job.unit_number || job.vehicle || "";
  const tireText = [job.qty, job.tires || job.size].filter(Boolean).join(" • ");

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(job.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart(job.id);
      }}
      onDragEnd={onDragEnd}
      style={{
        ...dragWrap,
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      <div
        style={{
          ...card,
          ...(isSelectedForMove ? selectedCard : {}),
        }}
      >
        <div style={cardTopRow}>
          <div style={customer}>{job.customer || "Unnamed Job"}</div>

          <div
            style={{
              ...tag,
              background: vehicleColor,
            }}
          >
            {vehicleLabel}
          </div>
        </div>

        {job.scheduled && (
          <div style={time}>🕒 {formatTimeNY(job.scheduled)}</div>
        )}

        {unitOrVehicle ? <div style={sub}>{unitOrVehicle}</div> : null}
        {job.address ? <div style={sub}>📍 {job.address}</div> : null}
        {phone ? <div style={sub}>📞 {phone}</div> : null}

        <div style={infoGrid}>
          <div style={infoItem}>
            <div style={infoLabel}>Service</div>
            <div style={infoValue}>{job.service_type || "-"}</div>
          </div>

          <div style={infoItem}>
            <div style={infoLabel}>PO #</div>
            <div style={infoValue}>{job.po_number || "-"}</div>
          </div>

          <div style={infoItem}>
            <div style={infoLabel}>Tires</div>
            <div style={infoValue}>{tireText || "-"}</div>
          </div>

          <div style={infoItem}>
            <div style={infoLabel}>Total</div>
            <div style={infoValueStrong}>{total || "-"}</div>
          </div>

          <div style={infoItem}>
            <div style={infoLabel}>Billing</div>
            <div style={infoValue}>{job.payment_status || "unpaid"}</div>
          </div>

          <div style={infoItem}>
            <div style={infoLabel}>Invoice</div>
            <div style={infoValue}>{job.invoice_number || "-"}</div>
          </div>

          <div style={infoItem}>
            <div style={infoLabel}>Status</div>
            <div style={infoValue}>{job.job_status || "scheduled"}</div>
          </div>

          <div style={infoItem}>
            <div style={infoLabel}>Bill To</div>
            <div style={infoValue}>{job.billing_name || "-"}</div>
          </div>
        </div>

        {job.notes && <div style={notes}>📝 {job.notes}</div>}

        <div style={cardActions}>
          <button
            type="button"
            style={editButton}
            onClick={(e) => {
              e.stopPropagation();
              onOpenJob(job.id);
            }}
          >
            Open Job
          </button>

          {isSelectedForMove ? (
            <button
              type="button"
              style={cancelMoveMiniButton}
              onClick={(e) => {
                e.stopPropagation();
                onCancelMove();
              }}
            >
              Cancel Move
            </button>
          ) : (
            <button
              type="button"
              style={moveButton}
              onClick={(e) => {
                e.stopPropagation();
                onPickForMove(job.id);
              }}
            >
              Move
            </button>
          )}
        </div>

        <div style={dragHint}>
          Desktop: drag to another day • iPhone: tap Move, then tap a day
        </div>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  background: "#f8fafc",
  minHeight: "100vh",
};

const page: React.CSSProperties = {
  padding: 16,
  maxWidth: 1400,
  margin: "0 auto",
};

const headerWrap: React.CSSProperties = {
  marginBottom: 16,
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  color: "#6b7280",
  marginBottom: 6,
};

const title: React.CSSProperties = {
  fontSize: 30,
  margin: 0,
  color: "#111827",
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#4b5563",
  fontSize: 15,
};

const spinnerPage: React.CSSProperties = {
  minHeight: "70vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const spinner: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "4px solid #e5e7eb",
  borderTop: "4px solid #2563eb",
  animation: "spin 0.8s linear infinite",
};

const spinnerText: React.CSSProperties = {
  marginTop: 12,
  fontSize: 15,
  color: "#374151",
};

const errorBanner: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 10,
  background: "#fee2e2",
  color: "#991b1b",
  fontSize: 14,
  fontWeight: 600,
};

const savingBanner: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 10,
  background: "#dbeafe",
  color: "#1d4ed8",
  fontSize: 14,
  fontWeight: 600,
};

const moveBanner: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 10,
  background: "#ecfccb",
  color: "#365314",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const moveBannerText: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
};

const cancelMoveButton: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "none",
  background: "#365314",
  color: "white",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  WebkitAppearance: "none",
  appearance: "none",
};

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 16,
};

const baseTopButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 600,
  WebkitAppearance: "none",
  appearance: "none",
  touchAction: "manipulation",
};

const navButton: React.CSSProperties = {
  ...baseTopButton,
  background: "#e5e7eb",
  color: "#111827",
};

const todayButton: React.CSSProperties = {
  ...baseTopButton,
  background: "#111827",
  color: "white",
};

const weekGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const dayColumn: React.CSSProperties = {
  background: "#f8fafc",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #e5e7eb",
  minHeight: 220,
  transition: "all 0.15s ease",
};

const dayColumnActive: React.CSSProperties = {
  border: "2px dashed #2563eb",
  background: "#eff6ff",
};

const dayColumnMoveTarget: React.CSSProperties = {
  boxShadow: "0 0 0 2px #84cc16 inset",
};

const dayHeader: React.CSSProperties = {
  padding: 12,
  background: "#e2e8f0",
  borderBottom: "1px solid #cbd5e1",
};

const dayHeaderText: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 16,
};

const dayCount: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  marginTop: 4,
};

const dayBody: React.CSSProperties = {
  padding: 10,
  minHeight: 120,
};

const emptyDay: React.CSSProperties = {
  fontSize: 14,
  color: "#6b7280",
  padding: 10,
};

const dragWrap: React.CSSProperties = {
  marginBottom: 8,
  cursor: "grab",
};

const card: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "white",
  boxShadow: "0 2px 5px rgba(0,0,0,0.08)",
  border: "1px solid #e5e7eb",
};

const selectedCard: React.CSSProperties = {
  outline: "3px solid #84cc16",
  background: "#f7fee7",
};

const cardTopRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 6,
};

const customer: React.CSSProperties = {
  fontWeight: "bold",
  fontSize: 15,
  flex: 1,
  minWidth: 0,
};

const sub: React.CSSProperties = {
  fontSize: 13,
  wordBreak: "break-word",
  marginTop: 4,
};

const time: React.CSSProperties = {
  fontSize: 13,
  color: "#374151",
  marginBottom: 6,
};

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
  marginTop: 10,
};

const infoItem: React.CSSProperties = {
  background: "#f9fafb",
  borderRadius: 8,
  padding: 8,
  minWidth: 0,
};

const infoLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  marginBottom: 4,
};

const infoValue: React.CSSProperties = {
  fontSize: 13,
  color: "#111827",
  wordBreak: "break-word",
};

const infoValueStrong: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#111827",
  wordBreak: "break-word",
};

const notes: React.CSSProperties = {
  fontSize: 12,
  color: "#4b5563",
  marginTop: 8,
  wordBreak: "break-word",
};

const tag: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  color: "black",
  fontSize: 12,
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const cardActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginTop: 10,
  flexWrap: "wrap",
};

const editButton: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "none",
  background: "#111827",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  WebkitAppearance: "none",
  appearance: "none",
};

const moveButton: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  WebkitAppearance: "none",
  appearance: "none",
};

const cancelMoveMiniButton: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "none",
  background: "#65a30d",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  WebkitAppearance: "none",
  appearance: "none",
};

const dragHint: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 10,
};