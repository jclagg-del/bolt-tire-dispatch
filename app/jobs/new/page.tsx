"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

type FormState = {
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
  scheduled: string;
  vehicle_id: string;
  notes: string;
  service_type: string;
  po_number: string;
  billing_name: string;
  job_total: string;
  payment_status: string;
  invoice_number: string;
  job_status: string;
};

function formatLocalDateTimeForDb(value: string) {
  if (!value) return null;
  return `${value}:00`;
}

export default function NewJobPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FormState>({
    customer: "",
    phone: "",
    email: "",
    vehicle: "",
    unit_number: "",
    vehicle_mileage: "",
    tires: "",
    size: "",
    qty: "",
    price_tires: "",
    address: "",
    scheduled: "",
    vehicle_id: "stepvan",
    notes: "",
    service_type: "",
    po_number: "",
    billing_name: "",
    job_total: "",
    payment_status: "unpaid",
    invoice_number: "",
    job_status: "scheduled",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (saving) return;

    if (!form.customer.trim()) {
      alert("Please enter a customer name");
      return;
    }

    setSaving(true);

    const payload = {
      customer: form.customer.trim(),
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
      address: form.address.trim() || null,
      scheduled: formatLocalDateTimeForDb(form.scheduled),
      vehicle_id: form.vehicle_id || "stepvan",
      notes: form.notes.trim() || null,
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
      complete: false,
    };

    const { error } = await supabase.from("jobs").insert([payload]);

    if (error) {
      alert(`Error saving job: ${error.message}`);
      setSaving(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div style={shell}>
      <AppHeader />

      <div style={page}>
        <div style={heroCard}>
          <div style={heroTop}>
            <div>
              <div style={eyebrow}>Jobs</div>
              <h1 style={title}>New Job</h1>
              <p style={subtitle}>
                Create a new job and capture contact, vehicle, tire, and billing info.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={card}>
          <div style={sectionTitle}>Job Info</div>

          <input
            name="customer"
            placeholder="Customer"
            value={form.customer}
            onChange={handleChange}
            style={input}
            autoComplete="organization"
          />

          <input
            name="phone"
            placeholder="Phone"
            value={form.phone}
            onChange={handleChange}
            style={input}
            inputMode="tel"
            autoComplete="tel"
          />

          <input
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            style={input}
            inputMode="email"
            autoComplete="email"
          />

          <input
            name="vehicle"
            placeholder="Vehicle"
            value={form.vehicle}
            onChange={handleChange}
            style={input}
          />

          <input
            name="unit_number"
            placeholder="Unit Number"
            value={form.unit_number}
            onChange={handleChange}
            style={input}
          />

          <input
            name="vehicle_mileage"
            placeholder="Vehicle Mileage"
            value={form.vehicle_mileage}
            onChange={handleChange}
            style={input}
            inputMode="numeric"
          />

          <input
            name="address"
            placeholder="Address"
            value={form.address}
            onChange={handleChange}
            style={input}
            autoComplete="street-address"
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
            placeholder="Tires"
            value={form.tires}
            onChange={handleChange}
            style={input}
          />

          <input
            name="size"
            placeholder="Size"
            value={form.size}
            onChange={handleChange}
            style={input}
          />

          <input
            name="qty"
            placeholder="Quantity"
            value={form.qty}
            onChange={handleChange}
            style={input}
            inputMode="numeric"
          />

          <input
            name="price_tires"
            placeholder="Tire Price (each)"
            value={form.price_tires}
            onChange={handleChange}
            style={input}
            inputMode="decimal"
          />

          <div style={sectionTitle}>Billing Info</div>

          <input
            name="po_number"
            placeholder="PO Number"
            value={form.po_number}
            onChange={handleChange}
            style={input}
          />

          <input
            name="billing_name"
            placeholder="Billing Name"
            value={form.billing_name}
            onChange={handleChange}
            style={input}
          />

          <input
            name="job_total"
            placeholder="Job Total"
            value={form.job_total}
            onChange={handleChange}
            style={input}
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
            placeholder="Invoice Number"
            value={form.invoice_number}
            onChange={handleChange}
            style={input}
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
            placeholder="Notes"
            value={form.notes}
            onChange={handleChange}
            style={textarea}
          />

          <button type="submit" style={button} disabled={saving}>
            {saving ? "Saving..." : "💾 Save Job"}
          </button>
        </form>
      </div>
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

const button: React.CSSProperties = {
  marginTop: 16,
  width: "100%",
  padding: 12,
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  WebkitAppearance: "none",
  appearance: "none",
};