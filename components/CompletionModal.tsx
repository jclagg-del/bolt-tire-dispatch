"use client";

type Props = {
  show: boolean;
  completing: boolean;
  mileageMissing: boolean;
  mileageConfirmed: boolean;
  torqueConfirmed: boolean;
  onMileageChange: (value: boolean) => void;
  onTorqueChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function CompletionModal({
  show,
  completing,
  mileageMissing,
  mileageConfirmed,
  torqueConfirmed,
  onMileageChange,
  onTorqueChange,
  onCancel,
  onConfirm,
}: Props) {
  if (!show) return null;

  const canComplete =
    !mileageMissing && mileageConfirmed && torqueConfirmed && !completing;

  return (
    <div style={modalOverlay}>
      <div style={modalCard}>
        <h2 style={modalTitle}>Before completing this job</h2>
        <p style={modalText}>Please confirm the required reminders below.</p>

        {mileageMissing && (
          <div style={warningBox}>
            Vehicle mileage has not been entered yet. Add mileage in the form before completing this job.
          </div>
        )}

        <label style={checkRow}>
          <input
            type="checkbox"
            checked={mileageConfirmed}
            onChange={(e) => onMileageChange(e.target.checked)}
            disabled={mileageMissing}
          />
          <span>Vehicle mileage has been entered</span>
        </label>

        <label style={checkRow}>
          <input
            type="checkbox"
            checked={torqueConfirmed}
            onChange={(e) => onTorqueChange(e.target.checked)}
          />
          <span>All wheels have been torqued properly</span>
        </label>

        <div style={modalButtonRow}>
          <button type="button" onClick={onCancel} style={modalCancelButton}>
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...modalCompleteButton,
              opacity: canComplete ? 1 : 0.6,
              cursor: canComplete ? "pointer" : "not-allowed",
            }}
            disabled={!canComplete}
          >
            {completing ? "Completing..." : "Confirm Complete"}
          </button>
        </div>
      </div>
    </div>
  );
}

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

const warningBox: React.CSSProperties = {
  background: "#fef3c7",
  color: "#92400e",
  padding: 12,
  borderRadius: 8,
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
