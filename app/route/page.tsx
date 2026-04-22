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
  qty?: number | string | null;
  service_type?: string | null;
  po_number?: string | null;
  job_total?: number | string | null;
  payment_status?: string | null;
  invoice_number?: string | null;
  job_status?: string | null;
  billing_name?: string | null;
  vehicle_mileage?: string | null;
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

function getNYDateKey(input: string | Date) {
  const date =
    input instanceof Date ? input : parseJobDate(input) || new Date(input);

  if (isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function formatTimeNY(input?: string | null) {
  const date = parseJobDate(input);
  if (!date) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return `$${num.toFixed(2)}`;
}

function cleanPhone(phone?: string | null) {
  if (!phone) return "";
  return phone.replace(/[^\d+]/g, "");
}

function mapsUrl(address?: string | null) {
  if (!address) return "#";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function RoutePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | number | null>(null);
  const [errorText, setErrorText] = useState("");
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [routeMileage, setRouteMileage] = useState("");
  const [mileageConfirmed, setMileageConfirmed] = useState(false);
  const [torqueConfirmed, setTorqueConfirmed] = useState(false);
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
        billing_name,
        vehicle_mileage
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

  const todayKey = useMemo(() => getNYDateKey(new Date()), []);

  const todaysJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        if (!job.scheduled || job.complete) return false;
        return getNYDateKey(job.scheduled) === todayKey;
      })
      .sort((a, b) => (a.scheduled || "").localeCompare(b.scheduled || ""));
  }, [jobs, todayKey]);

  const stepvanJobs = useMemo(() => {
    return todaysJobs.filter((job) => job.vehicle_id === "stepvan");
  }, [todaysJobs]);

  const serviceTruckJobs = useMemo(() => {
    return todaysJobs.filter((job) => job.vehicle_id !== "stepvan");
  }, [todaysJobs]);

  const openCompleteModal = (job: Job) => {
    setSelectedJob(job);
    setRouteMileage(job.vehicle_mileage || "");
    setMileageConfirmed(!!(job.vehicle_mileage || "").trim());
    setTorqueConfirmed(false);
    setShowCompleteModal(true);
  };

  const closeCompleteModal = () => {
    if (completingId) return;
    setShowCompleteModal(false);
    setSelectedJob(null);
    setRouteMileage("");
    setMileageConfirmed(false);
    setTorqueConfirmed(false);
  };

  const handleComplete = async () => {
    if (!selectedJob || completingId) return;

    if (!routeMileage.trim()) {
      alert("Please enter vehicle mileage before completing the job.");
      return;
    }

    if (!mileageConfirmed || !torqueConfirmed) {
      alert("Please confirm mileage and wheel torque before completing the job.");
      return;
    }

    setCompletingId(selectedJob.id);

    const { error } = await supabase
      .from("jobs")
      .update({
        vehicle_mileage: routeMileage.trim() || null,
        complete: true,
        job_status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", selectedJob.id);

    setCompletingId(null);

    if (error) {
      alert(`Error completing job: ${error.message}`);
      return;
    }

    closeCompleteModal();
    await fetchJobs();
  };

  if (loading) {
    return (
      <div style={shell}>
        <AppHeader />
        <div style={loadingPage}>
          <div style={loadingBox}>Loading today&apos;s route...</div>
        </div>
      </div>
    );
  }

  const mileageMissing = !routeMileage.trim();
  const canComplete =
    !!selectedJob && !mileageMissing && mileageConfirmed && torqueConfirmed && !completingId;

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={headerWrap}>
          <div style={eyebrow}>Route</div>
          <h1 style={title}>Today&apos;s Route</h1>
          <p style={subtitle}>
            Jobs are split by vehicle so the stepvan and service truck can run side by side.
          </p>
        </div>

        {errorText ? <div style={errorBanner}>Error: {errorText}</div> : null}

        <div style={columnsWrap}>
          <div style={column}>
            <div style={{ ...columnHeader, background: "#2563eb" }}>
              🚐 Stepvan ({stepvanJobs.length})
            </div>

            <div style={columnBody}>
              {stepvanJobs.length > 0 ? (
                stepvanJobs.map((job, index) => (
                  <RouteCard
                    key={job.id}
                    job={job}
                    stopNumber={index + 1}
                    isCompleting={completingId === job.id}
                    onComplete={() => openCompleteModal(job)}
                  />
                ))
              ) : (
                <div style={empty}>No Stepvan jobs today</div>
              )}
            </div>
          </div>

          <div style={column}>
            <div style={{ ...columnHeader, background: "#facc15", color: "#111" }}>
              🛠 Service Truck ({serviceTruckJobs.length})
            </div>

            <div style={columnBody}>
              {serviceTruckJobs.length > 0 ? (
                serviceTruckJobs.map((job, index) => (
                  <RouteCard
                    key={job.id}
                    job={job}
                    stopNumber={index + 1}
                    isCompleting={completingId === job.id}
                    onComplete={() => openCompleteModal(job)}
                  />
                ))
              ) : (
                <div style={empty}>No Service Truck jobs today</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCompleteModal && selectedJob && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <h2 style={modalTitle}>Before completing this job</h2>
            <p style={modalText}>
              Confirm the job is wrapped up properly before marking it complete.
            </p>

            <div style={jobNameBox}>
              {selectedJob.customer || "Unnamed Job"}
            </div>

            <input
              value={routeMileage}
              onChange={(e) => setRouteMileage(e.target.value)}
              style={modalInput}
              placeholder="Vehicle Mileage"
              inputMode="numeric"
            />

            {mileageMissing && (
              <div style={warningBox}>
                Vehicle mileage must be entered before this job can be completed.
              </div>
            )}

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={mileageConfirmed}
                onChange={(e) => setMileageConfirmed(e.target.checked)}
                disabled={mileageMissing}
              />
              <span>Vehicle mileage has been entered</span>
            </label>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={torqueConfirmed}
                onChange={(e) => setTorqueConfirmed(e.target.checked)}
              />
              <span>All wheels have been torqued properly</span>
            </label>

            <div style={modalButtonRow}>
              <button
                type="button"
                onClick={closeCompleteModal}
                style={modalCancelButton}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleComplete}
                style={{
                  ...modalCompleteButton,
                  opacity: canComplete ? 1 : 0.6,
                  cursor: canComplete ? "pointer" : "not-allowed",
                }}
                disabled={!canComplete}
              >
                {completingId === selectedJob.id ? "Completing..." : "Confirm Complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RouteCard({
  job,
  stopNumber,
  onComplete,
  isCompleting,
}: {
  job: Job;
  stopNumber: number;
  onComplete: () => void;
  isCompleting: boolean;
}) {
  const router = useRouter();
  const phone = job.phone || "";
  const phoneHref = cleanPhone(phone);
  const total = formatMoney(job.job_total);
  const unitOrVehicle = job.unit_number || job.vehicle || "";

  const tireParts: string[] = [];
  if (job.qty) tireParts.push(String(job.qty));
  if (job.tires) tireParts.push(String(job.tires));
  if (job.size) tireParts.push(String(job.size));
  const tireText = tireParts.length ? tireParts.join(" • ") : "-";

  return (
    <div style={card}>
      <div style={cardTop}>
        <div style={stopBadge}>Stop {stopNumber}</div>
        <button
          type="button"
          onClick={() => router.push(`/jobs/${job.id}`)}
          style={editBtn}
        >
          Edit
        </button>
      </div>

      <div style={customer}>{job.customer || "Unnamed Job"}</div>

      {job.scheduled && <div style={time}>🕒 {formatTimeNY(job.scheduled)}</div>}
      {unitOrVehicle ? <div style={sub}>🚗 {unitOrVehicle}</div> : null}
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
          <div style={infoValue}>{tireText}</div>
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

      <div style={buttonRow}>
        {job.address ? (
          <a href={mapsUrl(job.address)} target="_blank" rel="noreferrer" style={goBtn}>
            Go
          </a>
        ) : (
          <span style={btnDisabled}>Go</span>
        )}

        {phoneHref ? (
          <a href={`tel:${phoneHref}`} style={callBtn}>
            Call
          </a>
        ) : (
          <span style={btnDisabled}>Call</span>
        )}

        {phoneHref ? (
          <a href={`sms:${phoneHref}`} style={textBtn}>
            Text
          </a>
        ) : (
          <span style={btnDisabled}>Text</span>
        )}

        <button
          type="button"
          onClick={onComplete}
          style={completeBtn}
          disabled={isCompleting}
        >
          {isCompleting ? "Completing..." : "Complete"}
        </button>
      </div>
    </div>
  );
}

/* STYLES */

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

const loadingPage: React.CSSProperties = {
  minHeight: "70vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const loadingBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 10,
  background: "#f3f4f6",
  fontSize: 14,
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

const columnsWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 16,
};

const column: React.CSSProperties = {
  background: "#f8fafc",
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid #e5e7eb",
};

const columnHeader: React.CSSProperties = {
  padding: "12px 14px",
  color: "white",
  fontWeight: 700,
  fontSize: 18,
};

const columnBody: React.CSSProperties = {
  padding: 12,
};

const empty: React.CSSProperties = {
  padding: 16,
  background: "white",
  borderRadius: 12,
  color: "#666",
  border: "1px dashed #d1d5db",
};

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 12,
  marginBottom: 10,
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  border: "1px solid #e5e7eb",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const stopBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  background: "#e5e7eb",
  color: "#111",
  borderRadius: 999,
  padding: "4px 8px",
};

const editBtn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "none",
  background: "#111827",
  color: "white",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

const customer: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 6,
};

const time: React.CSSProperties = {
  fontSize: 13,
  color: "#2563eb",
  marginBottom: 6,
  fontWeight: 600,
};

const sub: React.CSSProperties = {
  fontSize: 13,
  marginTop: 4,
  wordBreak: "break-word",
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
  fontSize: 13,
  marginTop: 8,
  color: "#444",
  background: "#f9fafb",
  padding: 8,
  borderRadius: 8,
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  flexWrap: "wrap",
};

const actionBase: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 14,
  border: "none",
  cursor: "pointer",
  WebkitAppearance: "none",
  appearance: "none",
};

const goBtn: React.CSSProperties = {
  ...actionBase,
  background: "#16a34a",
  color: "white",
};

const callBtn: React.CSSProperties = {
  ...actionBase,
  background: "#2563eb",
  color: "white",
};

const textBtn: React.CSSProperties = {
  ...actionBase,
  background: "#7c3aed",
  color: "white",
};

const completeBtn: React.CSSProperties = {
  ...actionBase,
  background: "#111827",
  color: "white",
};

const btnDisabled: React.CSSProperties = {
  ...actionBase,
  background: "#d1d5db",
  color: "#666",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

const modalCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "white",
  borderRadius: 14,
  padding: 20,
  boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
};

const modalTitle: React.CSSProperties = {
  margin: 0,
  marginBottom: 8,
  fontSize: 22,
  fontWeight: 700,
};

const modalText: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
  color: "#4b5563",
  fontSize: 15,
};

const jobNameBox: React.CSSProperties = {
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
  fontWeight: 700,
  color: "#111827",
};

const modalInput: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  fontSize: 16,
  background: "#fff",
};

const warningBox: React.CSSProperties = {
  background: "#fef3c7",
  color: "#92400e",
  padding: 12,
  borderRadius: 8,
  marginTop: 12,
  marginBottom: 14,
  fontWeight: 600,
  fontSize: 14,
};

const checkRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  padding: "10px 0",
  fontSize: 16,
};

const modalButtonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 18,
  flexWrap: "wrap",
};

const modalCancelButton: React.CSSProperties = {
  flex: 1,
  minWidth: 140,
  padding: 12,
  background: "#e5e7eb",
  color: "#111827",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};

const modalCompleteButton: React.CSSProperties = {
  flex: 1,
  minWidth: 140,
  padding: 12,
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 10,
  fontWeight: 700,
};