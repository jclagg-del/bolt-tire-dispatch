"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import VehicleSelect from "@/components/VehicleSelect";
import CompletionModal from "@/components/CompletionModal";

type JobForm = {
  customer: string;
  contact_name: string;
  phone: string;
  email: string;
  vehicle: string;
  unit_number: string;
  vehicle_mileage: string;
  tires: string;
  size: string;
  qty: string;
  price_tires: string;
  tire_product_number: string;
  tires_ordered: boolean;
  tire_supplier: string;
  ordered_by: string;
  installation_cost: string;
  tire_disposal_fee: string;
  address: string;
  notes: string;
  scheduled: string;
  vehicle_id: string;
  service_type: string;
  po_number: string;
  mo_number: string;
  job_total: string;
  payment_status: string;
  invoice_number: string;
  job_status: string;
  submitted_by_customer: boolean;
  customer_order_status: string;
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

  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [form, setForm] = useState<JobForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [mileageConfirmed, setMileageConfirmed] = useState(false);
  const [torqueConfirmed, setTorqueConfirmed] = useState(false);

  const fetchJob = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        customer,
        contact_name,
        phone,
        email,
        vehicle,
        unit_number,
        vehicle_mileage,
        tires,
        size,
        qty,
        price_tires,
        tire_product_number,
        tires_ordered,
        tire_supplier,
        ordered_by,
        installation_cost,
        tire_disposal_fee,
        address,
        notes,
        scheduled,
        vehicle_id,
        service_type,
        po_number,
        mo_number,
        job_total,
        payment_status,
        invoice_number,
        job_status,
        submitted_by_customer,
        customer_order_status,
        complete
      `)
      .eq("id", id)
      .single();

    if (error) {
      alert(`Error loading job: ${error.message}`);
      return;
    }

    if (!data) return;

    setForm({
      customer: data.customer || "",
      contact_name: data.contact_name || "",
      phone: data.phone || "",
      email: data.email || "",
      vehicle: data.vehicle || "",
      unit_number: data.unit_number || "",
      vehicle_mileage: data.vehicle_mileage || "",
      tires: data.tires || "",
      size: data.size || "",
      qty:
        data.qty !== null && data.qty !== undefined
          ? String(data.qty)
          : "",
      price_tires:
        data.price_tires !== null && data.price_tires !== undefined
          ? String(data.price_tires)
          : "",
      tire_product_number: data.tire_product_number || "",
      tires_ordered: Boolean(data.tires_ordered),
      tire_supplier: data.tire_supplier || "",
      ordered_by: data.ordered_by || "",
      installation_cost:
        data.installation_cost !== null &&
        data.installation_cost !== undefined
          ? String(data.installation_cost)
          : "",
      tire_disposal_fee:
        data.tire_disposal_fee !== null &&
        data.tire_disposal_fee !== undefined
          ? String(data.tire_disposal_fee)
          : "",
      address: data.address || "",
      notes: data.notes || "",
      scheduled: formatForDateTimeLocal(data.scheduled),
      vehicle_id: data.vehicle_id || "stepvan",
      service_type: data.service_type || "",
      po_number: data.po_number || "",
      mo_number: data.mo_number || "",
      job_total:
        data.job_total !== null && data.job_total !== undefined
          ? String(data.job_total)
          : "",
      payment_status: data.payment_status || "unpaid",
      invoice_number: data.invoice_number || "",
      job_status: data.job_status || "scheduled",
      submitted_by_customer: Boolean(data.submitted_by_customer),
      customer_order_status: data.customer_order_status || "new",
      complete: Boolean(data.complete),
    });
  };

  useEffect(() => {
    if (id) {
      fetchJob();
    }
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    if (!form) return;

    const { name, value } = e.target;

    setForm((current) => {
      if (!current) return current;

      return {
        ...current,
        [name]: value,
      };
    });
  };

  const setVehicleId = (value: string) => {
    setForm((current) => {
      if (!current) return current;

      return {
        ...current,
        vehicle_id: value,
      };
    });
  };

  const handleTiresOrderedChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const checked = e.target.checked;

    setForm((current) => {
      if (!current) return current;

      return {
        ...current,
        tires_ordered: checked,
      };
    });
  };

  const handleSave = async () => {
    if (!form || !id || saving) return;

    setSaving(true);

    const quantity = form.qty.trim() ? Number(form.qty) : 0;
    const tirePrice = form.price_tires.trim()
      ? Number(form.price_tires)
      : 0;
    const installationCost = form.installation_cost.trim()
      ? Number(form.installation_cost)
      : 0;
    const tireDisposalFee = form.tire_disposal_fee.trim()
      ? Number(form.tire_disposal_fee)
      : 0;

    const calculatedJobTotal =
      quantity * tirePrice + installationCost + tireDisposalFee;

    const { error } = await supabase
      .from("jobs")
      .update({
        customer: form.customer.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        vehicle: form.vehicle.trim() || null,
        unit_number: form.unit_number.trim() || null,
        vehicle_mileage: form.vehicle_mileage.trim() || null,
        tires: form.tires.trim() || null,
        size: form.size.trim() || null,
        qty: form.qty.trim() ? Number(form.qty) : null,
        price_tires: form.price_tires.trim()
          ? Number(form.price_tires)
          : null,
        tire_product_number:
          form.tire_product_number.trim() || null,
        tires_ordered: form.tires_ordered,
        tire_supplier: form.tire_supplier.trim() || null,
        ordered_by: form.ordered_by.trim() || null,
        installation_cost: form.installation_cost.trim()
          ? Number(form.installation_cost)
          : null,
        tire_disposal_fee: form.tire_disposal_fee.trim()
          ? Number(form.tire_disposal_fee)
          : null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        scheduled: formatLocalDateTimeForDb(form.scheduled),
        vehicle_id: form.vehicle_id || "stepvan",
        service_type: form.service_type.trim() || null,
        po_number: form.po_number.trim() || null,
        mo_number: form.mo_number.trim() || null,
        job_total: calculatedJobTotal,
        payment_status: form.payment_status || "unpaid",
        invoice_number: form.invoice_number.trim() || null,
        job_status: form.job_status || "scheduled",
        submitted_by_customer: form.submitted_by_customer,
        customer_order_status:
          form.customer_order_status || "new",
      })
      .eq("id", id);

    setSaving(false);

    if (error) {
      alert(`Error saving job: ${error.message}`);
      return;
    }

    router.push("/jobs");
    router.refresh();
  };

  const handleArchive = async () => {
    if (!id || archiving) return;

    const confirmed = window.confirm(
      "Archive this job? It will be hidden from active job lists but not permanently deleted."
    );

    if (!confirmed) return;

    setArchiving(true);

    const { error } = await supabase
      .from("jobs")
      .update({
        archived: true,
        job_status: "archived",
      })
      .eq("id", id);

    setArchiving(false);

    if (error) {
      alert(`Error archiving job: ${error.message}`);
      return;
    }

    router.push("/jobs");
    router.refresh();
  };

  const openCompleteModal = () => {
    if (!form || completing) return;

    setMileageConfirmed(Boolean(form.vehicle_mileage.trim()));
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
      alert(
        "Please confirm mileage and wheel torque before completing the job."
      );
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
                Update job details, tire ordering, costs, billing,
                and completion status.
              </p>

              {form.submitted_by_customer && (
                <div style={customerOrderBadge}>
                  Kingdom Support Services order
                </div>
              )}
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
                  {completing
                    ? "Completing..."
                    : "✅ Complete Job"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReopen}
                  style={reopenButton}
                  disabled={completing}
                >
                  {completing
                    ? "Updating..."
                    : "↩️ Reopen Job"}
                </button>
              )}

              <button
                type="button"
                onClick={handleArchive}
                style={archiveButton}
                disabled={archiving}
              >
                {archiving
                  ? "Archiving..."
                  : "📦 Archive Job"}
              </button>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={sectionTitle}>Job Info</div>

          <label style={fieldLabel}>Customer</label>
          <input
            name="customer"
            value={form.customer}
            onChange={handleChange}
            style={input}
            placeholder="Customer"
          />

          <label style={fieldLabel}>Contact Name</label>
          <input
            name="contact_name"
            value={form.contact_name}
            onChange={handleChange}
            style={input}
            placeholder="Contact Name"
          />

          <label style={fieldLabel}>Contact Number</label>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            style={input}
            placeholder="Phone"
            inputMode="tel"
          />

          <label style={fieldLabel}>Email</label>
          <input
            name="email"
            value={form.email}
            onChange={handleChange}
            style={input}
            placeholder="Email"
            inputMode="email"
          />

          <label style={fieldLabel}>Vehicle</label>
          <input
            name="vehicle"
            value={form.vehicle}
            onChange={handleChange}
            style={input}
            placeholder="Vehicle"
          />

          <label style={fieldLabel}>Unit Number</label>
          <input
            name="unit_number"
            value={form.unit_number}
            onChange={handleChange}
            style={input}
            placeholder="Unit Number"
          />

          <label style={fieldLabel}>Vehicle Mileage</label>
          <input
            name="vehicle_mileage"
            value={form.vehicle_mileage}
            onChange={handleChange}
            style={input}
            placeholder="Vehicle Mileage"
            inputMode="numeric"
          />

          <label style={fieldLabel}>Service Address</label>
          <input
            name="address"
            value={form.address}
            onChange={handleChange}
            style={input}
            placeholder="Address"
          />

          <label style={fieldLabel}>Scheduled Date and Time</label>
          <input
            type="datetime-local"
            name="scheduled"
            value={form.scheduled}
            onChange={handleChange}
            style={input}
          />

          <label style={fieldLabel}>Assigned Service Vehicle</label>
          <VehicleSelect
            value={form.vehicle_id}
            onChange={setVehicleId}
            style={input}
          />

          <label style={fieldLabel}>Service Type</label>
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

          <div style={sectionTitle}>Customer Order</div>

          <label style={fieldLabel}>Job Number / PO Number</label>
          <input
            name="po_number"
            value={form.po_number}
            onChange={handleChange}
            style={input}
            placeholder="Job Number or PO Number"
          />

          <label style={fieldLabel}>MO Number</label>
          <input
            name="mo_number"
            value={form.mo_number}
            onChange={handleChange}
            style={input}
            placeholder="MO Number"
          />

          {form.submitted_by_customer && (
            <>
              <label style={fieldLabel}>Customer Order Status</label>

              <select
                name="customer_order_status"
                value={form.customer_order_status}
                onChange={handleChange}
                style={input}
              >
                <option value="new">New Request</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </>
          )}

          <div style={sectionTitle}>Tire Info</div>

          <label style={fieldLabel}>Tire Brand or Product</label>
          <input
            name="tires"
            value={form.tires}
            onChange={handleChange}
            style={input}
            placeholder="Tires"
          />

          <label style={fieldLabel}>Tire Size</label>
          <input
            name="size"
            value={form.size}
            onChange={handleChange}
            style={input}
            placeholder="Tire Size"
          />

          <label style={fieldLabel}>Quantity</label>
          <input
            name="qty"
            value={form.qty}
            onChange={handleChange}
            style={input}
            placeholder="Quantity"
            inputMode="numeric"
          />

          <label style={fieldLabel}>Tire Product Number</label>
          <input
            name="tire_product_number"
            value={form.tire_product_number}
            onChange={handleChange}
            style={input}
            placeholder="Tire Product Number"
          />

          <label style={fieldLabel}>Tire Price Each</label>
          <input
            name="price_tires"
            value={form.price_tires}
            onChange={handleChange}
            style={input}
            placeholder="Tire Price (each)"
            inputMode="decimal"
          />

          <div style={sectionTitle}>Tire Ordering</div>

          <div
            style={
              form.tires_ordered
                ? orderedStatusCard
                : notOrderedStatusCard
            }
          >
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={form.tires_ordered}
                onChange={handleTiresOrderedChange}
                style={checkbox}
              />

              <span>
                <strong>
                  {form.tires_ordered
                    ? "Tires Ordered"
                    : "Tires Not Ordered"}
                </strong>

                <span style={checkboxHelp}>
                  {form.tires_ordered
                    ? "The tires for this job have been ordered."
                    : "Check this box after ordering the tires."}
                </span>
              </span>
            </label>
          </div>

          <label style={fieldLabel}>Tire Supplier</label>
          <input
            name="tire_supplier"
            value={form.tire_supplier}
            onChange={handleChange}
            style={input}
            placeholder="Supplier"
          />

          <label style={fieldLabel}>Ordered By</label>
          <input
            name="ordered_by"
            value={form.ordered_by}
            onChange={handleChange}
            style={input}
            placeholder="Ordered By"
          />

          <div style={sectionTitle}>Service Costs</div>

          <label style={fieldLabel}>Installation Cost</label>
          <input
            name="installation_cost"
            value={form.installation_cost}
            onChange={handleChange}
            style={input}
            placeholder="Total Installation Cost"
            inputMode="decimal"
          />

          <label style={fieldLabel}>Tire Disposal Fee</label>
          <input
            name="tire_disposal_fee"
            value={form.tire_disposal_fee}
            onChange={handleChange}
            style={input}
            placeholder="Total Tire Disposal Fee"
            inputMode="decimal"
          />

          <div style={costBreakdown}>
            <div style={costRow}>
              <span>Tires</span>
              <strong>
                ${(
                  (Number(form.qty) || 0) *
                  (Number(form.price_tires) || 0)
                ).toFixed(2)}
              </strong>
            </div>

            <div style={costRow}>
              <span>Installation</span>
              <strong>
                ${(Number(form.installation_cost) || 0).toFixed(2)}
              </strong>
            </div>

            <div style={costRow}>
              <span>Disposal</span>
              <strong>
                ${(Number(form.tire_disposal_fee) || 0).toFixed(2)}
              </strong>
            </div>

            <div style={costTotalRow}>
              <span>Job Total</span>
              <strong>
                ${(
                  (Number(form.qty) || 0) *
                    (Number(form.price_tires) || 0) +
                  (Number(form.installation_cost) || 0) +
                  (Number(form.tire_disposal_fee) || 0)
                ).toFixed(2)}
              </strong>
            </div>
          </div>

          <div style={sectionTitle}>Billing Info</div>

          <label style={fieldLabel}>Job Total</label>
          <input
            name="job_total"
            value={(
              (Number(form.qty) || 0) *
                (Number(form.price_tires) || 0) +
              (Number(form.installation_cost) || 0) +
              (Number(form.tire_disposal_fee) || 0)
            ).toFixed(2)}
            readOnly
            style={{ ...input, background: "#f3f4f6" }}
            placeholder="Job Total"
            inputMode="decimal"
          />

          <label style={fieldLabel}>Payment Status</label>
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

          <label style={fieldLabel}>Invoice Number</label>
          <input
            name="invoice_number"
            value={form.invoice_number}
            onChange={handleChange}
            style={input}
            placeholder="Invoice Number"
          />

          <label style={fieldLabel}>Job Status</label>
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

      <CompletionModal
        show={showCompleteModal}
        completing={completing}
        mileageMissing={mileageMissing}
        mileageConfirmed={mileageConfirmed}
        torqueConfirmed={torqueConfirmed}
        onMileageChange={setMileageConfirmed}
        onTorqueChange={setTorqueConfirmed}
        onCancel={closeCompleteModal}
        onConfirm={handleComplete}
      />
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
  marginBottom: 0,
  color: "#4b5563",
  fontSize: 15,
};

const customerOrderBadge: React.CSSProperties = {
  display: "inline-block",
  marginTop: 12,
  padding: "7px 10px",
  borderRadius: 999,
  background: "#fef3c7",
  color: "#92400e",
  fontSize: 13,
  fontWeight: 800,
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
  marginTop: 28,
  marginBottom: 6,
  paddingBottom: 8,
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  fontWeight: 800,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  marginTop: 14,
  marginBottom: -5,
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
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
  resize: "vertical",
};

const orderedStatusCard: React.CSSProperties = {
  marginTop: 12,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #86efac",
  background: "#f0fdf4",
};

const notOrderedStatusCard: React.CSSProperties = {
  marginTop: 12,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #fcd34d",
  background: "#fffbeb",
};

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  cursor: "pointer",
  color: "#111827",
};

const checkbox: React.CSSProperties = {
  width: 22,
  height: 22,
  marginTop: 1,
  cursor: "pointer",
};

const checkboxHelp: React.CSSProperties = {
  display: "block",
  marginTop: 3,
  color: "#6b7280",
  fontSize: 13,
  fontWeight: 400,
};

const costBreakdown: React.CSSProperties = {
  marginTop: 18,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #dbeafe",
  background: "#f8fafc",
};

const costRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "6px 0",
  color: "#374151",
  fontSize: 14,
};

const costTotalRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  marginTop: 8,
  paddingTop: 12,
  borderTop: "1px solid #cbd5e1",
  color: "#111827",
  fontSize: 16,
  fontWeight: 800,
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

const archiveButton: React.CSSProperties = {
  padding: "12px 14px",
  background: "#6b7280",
  color: "white",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};