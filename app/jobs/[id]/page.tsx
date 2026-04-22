"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

type JobForm = {
  customer: string;
  phone: string;
  email: string;
  vehicle: string;
  unit_number: string;
  vehicle_mileage: string;
  tires: string;
  size: string;
  qty: string;
  price_tires: string;
  address: string;
  notes: string;
  scheduled: string;
  vehicle_id: string;
  service_type: string;
  po_number: string;
  billing_name: string;
  job_total: string;
  payment_status: string;
  invoice_number: string;
  job_status: string;
  complete?: boolean;
};

function formatForDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const clean = value.replace(" ", "T");
  return clean.substring(0, 16);
}

function formatLocalDateTimeForDb(value: string) {
  if (!value) return null;
  return `${value}:00`;
}

export default function EditJobPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [form, setForm] = useState<JobForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [mileageConfirmed, setMileageConfirmed] = useState(false);
  const [torqueConfirmed, setTorqueConfirmed] = useState(false);

  const fetchJob = async () => {
    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        customer,
        phone,
        email,
        vehicle,
        unit_number,
        vehicle_mileage,
        tires,
        size,
        qty,
        price_tires,
        address,
        notes,
        scheduled,
        vehicle_id,
        service_type,
        po_number,
        billing_name,
        job_total,
        payment_status,
        invoice_number,
        job_status,
        complete
      `)
      .eq("id", id)
      .single();

    if (error) {
      alert(`Error loading job: ${error.message}`);
      return;
    }

    if (data) {
      setForm({
        customer: data.customer || "",
        phone: data.phone || "",
        email: data.email || "",
        vehicle: data.vehicle || "",
        unit_number: data.unit_number || "",
        vehicle_mileage: data.vehicle_mileage || "",
        tires: data.tires || "",
        size: data.size || "",
        qty: data.qty ? String(data.qty) : "",
        price_tires:
          data.price_tires !== null && data.price_tires !== undefined
            ? String(data.price_tires)
            : "",
        address: data.address || "",
        notes: data.notes || "",
        scheduled: formatForDateTimeLocal(data.scheduled),
        vehicle_id: data.vehicle_id || "stepvan",
        service_type: data.service_type || "",
        po_number: data.po_number || "",
        billing_name: data.billing_name || "",
        job_total:
          data.job_total !== null && data.job_total !== undefined
            ? String(data.job_total)
            : "",
        payment_status: data.payment_status || "unpaid",
        invoice_number: data.invoice_number || "",
        job_status: data.job_status || "scheduled",
        complete: !!data.complete,
      });
    }
  };

  useEffect(() => {
    if (id) fetchJob();
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    if (!form) return;
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!form || saving) return;

    setSaving(true);

    const { error } = await supabase
      .from("jobs")
      .update({
        customer: form.customer.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        vehicle: form.vehicle.trim() || null,
        unit_number: form.unit_number.trim() || null,
        vehicle_mileage: form.vehicle_mileage.trim() || null,
        tires: form.tires.trim() || null,
        size: form.size.trim() || null,
        qty: form.qty ? Number(form.qty) : null,
        price_tires: form.price_tires.trim()
          ? Number(form.price_tires)
          : null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        scheduled: formatLocalDateTimeForDb(form.scheduled),
        vehicle_id: form.vehicle_id || "stepvan",
        service_type: form.service_type.trim() || null,
        po_number: form.po_number.trim() || null,
        billing_name: form.billing_name.trim() || null,
        job_total: form.job_total.trim()
          ? Number(form.job_total)
          : form.qty && form.price_tires
          ? Number(form.qty) * Number(form.price_tires)
          : null,
        payment_status: form.payment_status || "unpaid",
        invoice_number: form.invoice_number.trim() || null,
        job_status: form.job_status || "scheduled",
      })
      .eq("id", id);

    setSaving(false);

    if (error) {
      alert(`Error saving job: ${error.message}`);
      return;
    }

    router.push("/");
    router.refresh();
  };

  const openCompleteModal = () => {
    if (!form || completing) return;
    setMileageConfirmed(!!form.vehicle_mileage.trim());
    setTorqueConfirmed(false);
    setShowCompleteModal(true);
  };

  const closeCompleteModal = () => {
    if (completing) return;
    setShowCompleteModal(false);
    setMileageConfirmed(false);
    setTorqueConfirmed(false);
  };

  const handleComplete = async () => {
    if (!id || !form || completing) return;

    if (!form.vehicle_mileage.trim()) {
      alert("Please enter vehicle mileage before completing the job.");
      return;
    }

    if (!mileageConfirmed || !torqueConfirmed) {
      alert("Please confirm mileage and wheel torque before completing the job.");
      return;
    }

    setCompleting(true);

    const { error } = await supabase
      .from("jobs")
      .update({
        vehicle_mileage: form.vehicle_mileage.trim() || null,
        complete: true,
        job_status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    setCompleting(false);

    if (error) {
      alert(`Error completing job: ${error.message}`);
      return;
    }

    setShowCompleteModal(false);
    router.push("/completed");
    router.refresh();
  };

  const handleReopen = async () => {
    if (!id || completing) return;

    setCompleting(true);

    const { error } = await supabase
      .from("jobs")
      .update({
        complete: false,
        job_status: "scheduled",
        completed_at: null,
      })
      .eq("id", id);

    setCompleting(false);

    if (error) {
      alert(`Error reopening job: ${error.message}`);
      return;
    }

    await fetchJob();
  };

  if (!form) {
    return (
      <div style={shell}>
        <AppHeader />
        <p style={{ padding: 20 }}>Loading...</p>
      </div>
    );
  }

  const mileageMissing = !form.vehicle_mileage.trim();
  const canComplete =
    !mileageMissing && mileageConfirmed && torqueConfirmed && !completing;

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={eyebrow}>Jobs</div>
              <h1 style={title}>Edit Job</h1>
              <p style={subtitle}>
                Update job details, billing info, and completion status.
              </p>
            </div>

            <div style={heroActions}>
              <button
                type="button"
                onClick={handleSave}
                style={saveButton}
                disabled={saving}
              >
                {saving ? "Saving..." : "💾 Save Changes"}
              </button>

              {!form.complete ? (
                <button
                  type="button"
                  onClick={openCompleteModal}
                  style={completeButton}
                  disabled={completing}
                >
                  {completing ? "Completing..." : "✅ Complete Job"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReopen}
                  style={reopenButton}
                  disabled={completing}
                >
                  {completing ? "Updating..." : "↩️ Reopen Job"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={sectionTitle}>Job Info</div>

          <input
            name="customer"
            value={form.customer}
            onChange={handleChange}
            style={input}
            placeholder="Customer"
          />

          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            style={input}
            placeholder="Phone"
          />

          <input
            name="email"
            value={form.email}
            onChange={handleChange}
            style={input}
            placeholder="Email"
            inputMode="email"
          />

          <input
            name="vehicle"
            value={form.vehicle}
            onChange={handleChange}
            style={input}
            placeholder="Vehicle"
          />

          <input
            name="unit_number"
            value={form.unit_number}
            onChange={handleChange}
            style={input}
            placeholder="Unit Number"
          />

          <input
            name="vehicle_mileage"
            value={form.vehicle_mileage}
            onChange={handleChange}
            style={input}
            placeholder="Vehicle Mileage"
            inputMode="numeric"
          />

          <input
            name="address"
            value={form.address}
            onChange={handleChange}
            style={input}
            placeholder="Address"
          />

          <input
            type="datetime-local"
            name="scheduled"
            value={form.scheduled}
            onChange={handleChange}
            style={input}
          />

          <select
            name="vehicle_id"
            value={form.vehicle_id}
            onChange={handleChange}
            style={input}
          >
            <option value="stepvan">🚐 Stepvan</option>
            <option value="service">🛠 Service Truck</option>
          </select>

          <select
            name="service_type"
            value={form.service_type}
            onChange={handleChange}
            style={input}
          >
            <option value="">Service Type</option>
            <option value="new tires">New Tires</option>
            <option value="repair">Repair</option>
            <option value="swap">Swap</option>
            <option value="roadside">Roadside</option>
            <option value="delivery">Delivery</option>
            <option value="inspection">Inspection</option>
          </select>

          <div style={sectionTitle}>Tire Info</div>

          <input
            name="tires"
            value={form.tires}
            onChange={handleChange}
            style={input}
            placeholder="Tires"
          />

          <input
            name="size"
            value={form.size}
            onChange={handleChange}
            style={input}
            placeholder="Size"
          />

          <input
            name="qty"
            value={form.qty}
            onChange={handleChange}
            style={input}
            placeholder="Quantity"
            inputMode="numeric"
          />

          <input
            name="price_tires"
            value={form.price_tires}
            onChange={handleChange}
            style={input}
            placeholder="Tire Price (each)"
            inputMode="decimal"
          />

          <div style={sectionTitle}>Billing Info</div>

          <input
            name="po_number"
            value={form.po_number}
            onChange={handleChange}
            style={input}
            placeholder="PO Number"
          />

          <input
            name="billing_name"
            value={form.billing_name}
            onChange={handleChange}
            style={input}
            placeholder="Billing Name"
          />

          <input
            name="job_total"
            value={form.job_total}
            onChange={handleChange}
            style={input}
            placeholder="Job Total"
            inputMode="decimal"
          />

          <select
            name="payment_status"
            value={form.payment_status}
            onChange={handleChange}
            style={input}
          >
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>

          <input
            name="invoice_number"
            value={form.invoice_number}
            onChange={handleChange}
            style={input}
            placeholder="Invoice Number"
          />

          <select
            name="job_status"
            value={form.job_status}
            onChange={handleChange}
            style={input}
          >
            <option value="scheduled">Scheduled</option>
            <option value="en_route">En Route</option>
            <option value="on_site">On Site</option>
            <option value="completed">Completed</option>
            <option value="billed">Billed</option>
            <option value="paid">Paid</option>
          </select>

          <div style={sectionTitle}>Notes</div>

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            style={textarea}
            placeholder="Notes"
          />
        </div>
      </div>

      {showCompleteModal && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <h2 style={modalTitle}>Before completing this job</h2>
            <p style={modalText}>
              Please confirm the required reminders below.
            </p>

            {mileageMissing && (
              <div style={warningBox}>
                Vehicle mileage has not been entered yet. Add mileage in the form before completing this job.
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
                {completing ? "Completing..." : "Confirm Complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const shell: React.CSSProperties = {
  background: "#f8fafc",
  minHeight: "100vh",
};

const page: React.CSSProperties = {
  padding: 20,
  maxWidth: 900,
  margin: "0 auto",
};

const heroCard: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 18,
  marginBottom: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const heroTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  color: "#6b7280",
  marginBottom: 6,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  color: "#111827",
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#4b5563",
  fontSize: 15,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 18,
  borderRadius: 16,
  background: "white",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 16,
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 800,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 12,
  marginTop: 10,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  fontSize: 16,
  background: "#fff",
};

const textarea: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 12,
  marginTop: 10,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  fontSize: 16,
  minHeight: 110,
  background: "#fff",
};

const saveButton: React.CSSProperties = {
  padding: "12px 14px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};

const completeButton: React.CSSProperties = {
  padding: "12px 14px",
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};

const reopenButton: React.CSSProperties = {
  padding: "12px 14px",
  background: "#f59e0b",
  color: "white",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
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