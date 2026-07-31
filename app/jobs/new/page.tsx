"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

type VehicleOption = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  sort_order: number;
};

type FormState = {
  customer: string;
  contact_name: string;
  phone: string;
  email: string;
  submitted_by: string;
  vehicle: string;
  license_plate: string;
  vehicle_mileage: string;
  tire_position: string;
  tires: string;
  size: string;
  qty: string;
  price_tires: string;
  tire_product_number: string;
  tires_ordered: boolean;
  tire_supplier: string;
  estimated_delivery_date: string;
  tires_received: boolean;
  installation_cost: string;
  tire_disposal_fee: string;
  ny_state_tire_fee: string;
  address: string;
  scheduled: string;
  vehicle_id: string;
  notes: string;
  service_type: string;
  po_number: string;
  mo_number: string;
  job_total: string;
  payment_status: string;
  invoice_number: string;
  job_status: string;
  sales_tax_rate: string;
  tax_exempt: boolean;
  quickbooks_customer_id: string;
};

type QuickBooksCustomer = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  address: string;
};

function formatLocalDateTimeForDb(value: string) {
  if (!value) return null;
  return `${value}:00`;
}

const fallbackVehicles: VehicleOption[] = [
  {
    id: "stepvan",
    name: "Stepvan",
    color: "#2563eb",
    active: true,
    sort_order: 1,
  },
  {
    id: "service",
    name: "Service Truck",
    color: "#facc15",
    active: true,
    sort_order: 2,
  },
  {
    id: "sprinter",
    name: "Sprinter",
    color: "#10b981",
    active: true,
    sort_order: 3,
  },
];

export default function NewJobPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [vehicles, setVehicles] = useState<VehicleOption[]>(fallbackVehicles);
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);
  const [quickBooksCustomers, setQuickBooksCustomers] = useState<QuickBooksCustomer[]>([]);

  const [form, setForm] = useState<FormState>({
    customer: "",
    contact_name: "",
    submitted_by: "",
    phone: "",
    email: "",
    vehicle: "",
    license_plate: "",
    vehicle_mileage: "",
    tire_position: "",
    tires: "",
    size: "",
    qty: "",
    price_tires: "",
    tire_product_number: "",
    tires_ordered: false,
    tire_supplier: "",
    estimated_delivery_date: "",
    tires_received: false,
    installation_cost: "",
    tire_disposal_fee: "",
    ny_state_tire_fee: "",
    address: "",
    scheduled: "",
    vehicle_id: "stepvan",
    notes: "",
    service_type: "",
    po_number: "",
    mo_number: "",
    job_total: "",
    payment_status: "unpaid",
    invoice_number: "",
    job_status: "scheduled",
    sales_tax_rate: "",
    tax_exempt: false,
    quickbooks_customer_id: "",
  });

  useEffect(() => {
    const loadCustomers = async () => {
      const { data } = await supabase
        .from("jobs")
        .select("customer")
        .not("customer", "is", null)
        .order("customer", { ascending: true });

      const names = Array.from(
        new Set((data || []).map((row) => String(row.customer || "").trim()).filter(Boolean))
      );
      setCustomerOptions(names);
    };

    loadCustomers();
  }, []);

  useEffect(() => {
    const loadVehicles = async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id,name,color,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (error || !data || data.length === 0) {
        setVehicles(fallbackVehicles);
        return;
      }

      setVehicles(data as VehicleOption[]);

      setForm((prev) => ({
        ...prev,
        vehicle_id: prev.vehicle_id || data[0].id || "stepvan",
      }));
    };

    loadVehicles();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "qty" ? {
        tire_disposal_fee: ((Number(value) || 0) * 4).toFixed(2),
        ny_state_tire_fee: ((Number(value) || 0) * 2.5).toFixed(2),
      } : {}),
    }));
  };

  useEffect(() => {
    const customer = form.customer.trim();

    if (customer.length < 3) {
      setLookupMessage("");
      return;
    }

    const timer = setTimeout(async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const quickBooksResponse = await fetch(`/api/quickbooks/customers?q=${encodeURIComponent(customer)}`, {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token || ""}` },
      });
      const quickBooksData = await quickBooksResponse.json().catch(() => ({ customers: [] }));
      const matches = (quickBooksData.customers || []) as QuickBooksCustomer[];
      setQuickBooksCustomers(matches);

      const { data, error } = await supabase
        .from("jobs")
        .select("contact_name,phone,email,address,sales_tax_rate,tax_exempt")
        .ilike("customer", customer)
        .order("scheduled", { ascending: false, nullsFirst: false })
        .limit(1);

      if (error) {
        setLookupMessage("");
        return;
      }

      const match = data?.[0];

      const quickBooksMatch = matches.find(
        (candidate) => candidate.displayName.toLowerCase() === customer.toLowerCase()
      );

      if (!match && !quickBooksMatch) {
        setLookupMessage(matches.length ? "Select a QuickBooks customer from the suggestions." : "");
        return;
      }

      setForm((prev) => ({
        ...prev,
        contact_name: prev.contact_name || match?.contact_name || "",
        phone: prev.phone || quickBooksMatch?.phone || match?.phone || "",
        email: prev.email || quickBooksMatch?.email || match?.email || "",
        address: prev.address || quickBooksMatch?.address || match?.address || "",
        sales_tax_rate: prev.sales_tax_rate || (match?.sales_tax_rate != null ? String(match.sales_tax_rate) : ""),
        tax_exempt: Boolean(match?.tax_exempt),
        quickbooks_customer_id: quickBooksMatch?.id || prev.quickbooks_customer_id,
      }));

      setLookupMessage(quickBooksMatch ? "QuickBooks customer info filled." : "Repeat customer info filled from last job.");
    }, 500);

    return () => clearTimeout(timer);
  }, [form.customer]);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (saving) return;

    if (!form.customer.trim()) {
      alert("Please enter a customer name");
      return;
    }

    setSaving(true);

    const quantity = Number(form.qty) || 0;
    const tireDisposalFee = quantity * 4;
    const nyStateTireFee = quantity * 2.5;
    const subtotal =
      quantity * (Number(form.price_tires) || 0) +
      (Number(form.installation_cost) || 0) +
      tireDisposalFee +
      nyStateTireFee;
    const taxableSubtotal = subtotal - nyStateTireFee;
    const salesTaxRate = form.tax_exempt ? 0 : Number(form.sales_tax_rate) || 0;
    const salesTaxAmount = taxableSubtotal * (salesTaxRate / 100);

    const payload = {
      customer: form.customer.trim(),
      contact_name: form.contact_name.trim() || null,
      submitted_by: form.submitted_by.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      vehicle: form.vehicle.trim() || null,
      license_plate: form.license_plate.trim() || null,
      vehicle_mileage: form.vehicle_mileage.trim() || null,
      tire_position: form.tire_position.trim() || null,
      tires: form.tires.trim() || null,
      size: form.size.trim() || null,
      qty: form.qty.trim() ? Number(form.qty) : null,
      price_tires: form.price_tires.trim() ? Number(form.price_tires) : null,
      tire_product_number: form.tire_product_number.trim() || null,
      tires_ordered: form.tires_ordered,
      tire_supplier: form.tire_supplier.trim() || null,
      estimated_delivery_date: form.estimated_delivery_date || null,
      tires_received: form.tires_received,
      installation_cost: form.installation_cost.trim()
        ? Number(form.installation_cost)
        : null,
      tire_disposal_fee: tireDisposalFee,
      ny_state_tire_fee: nyStateTireFee,
      address: form.address.trim() || null,
      scheduled: formatLocalDateTimeForDb(form.scheduled),
      vehicle_id: form.vehicle_id || vehicles[0]?.id || "stepvan",
      notes: form.notes.trim() || null,
      service_type: form.service_type.trim() || null,
      po_number: form.po_number.trim() || null,
      mo_number: form.mo_number.trim() || null,
      subtotal,
      sales_tax_rate: salesTaxRate,
      sales_tax_amount: salesTaxAmount,
      tax_exempt: form.tax_exempt,
      quickbooks_customer_id: form.quickbooks_customer_id || null,
      job_total: subtotal + salesTaxAmount,
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
                Create a new job and auto-fill repeat customer contact info.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={card}>
          <div style={sectionTitle}>Customer Information</div>

          <div style={twoColumnGrid}>
            <Field>
              <label style={fieldLabel}>Customer</label>
              <input
                name="customer"
                list="customer-options"
                placeholder="Customer"
                value={form.customer}
                onChange={handleChange}
                style={input}
                autoComplete="organization"
              />
              <datalist id="customer-options">
                {Array.from(new Set([...quickBooksCustomers.map((customer) => customer.displayName), ...customerOptions])).map((customer) => (
                  <option key={customer} value={customer} />
                ))}
              </datalist>
            </Field>

            <Field>
              <label style={fieldLabel}>Submitted By</label>
              <input
                name="submitted_by"
                placeholder="Submitted By"
                value={form.submitted_by}
                onChange={handleChange}
                style={input}
              />
            </Field>

            <Field>
              <label style={fieldLabel}>Contact Name</label>
              <input
                name="contact_name"
                placeholder="Contact Name"
                value={form.contact_name}
                onChange={handleChange}
                style={input}
                autoComplete="name"
              />
            </Field>

            <Field>
              <label style={fieldLabel}>Contact Number</label>
              <input
                name="phone"
                placeholder="Phone"
                value={form.phone}
                onChange={handleChange}
                style={input}
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>

            <Field fullWidth>
              <label style={fieldLabel}>Email</label>
              <input
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                style={input}
                inputMode="email"
                autoComplete="email"
              />
            </Field>
          </div>

          {lookupMessage ? <div style={notice}>{lookupMessage}</div> : null}

          <div style={sectionTitle}>Vehicle</div>

          <div style={twoColumnGrid}>
            <Field fullWidth>
              <label style={fieldLabel}>Vehicle Details</label>
              <input
                name="vehicle"
                placeholder="Year Make Model • Color"
                value={form.vehicle}
                onChange={handleChange}
                style={input}
              />
            </Field>

            <Field>
              <label style={fieldLabel}>License Plate</label>
              <input
                name="license_plate"
                placeholder="License Plate"
                value={form.license_plate}
                onChange={handleChange}
                style={input}
                autoCapitalize="characters"
              />
            </Field>

            <Field>
              <label style={fieldLabel}>Vehicle Mileage</label>
              <input
                name="vehicle_mileage"
                placeholder="Vehicle Mileage"
                value={form.vehicle_mileage}
                onChange={handleChange}
                style={input}
                inputMode="numeric"
              />
            </Field>

            <Field fullWidth>
              <label style={fieldLabel}>Assigned Service Vehicle</label>
              <select
                name="vehicle_id"
                value={form.vehicle_id}
                onChange={handleChange}
                style={input}
              >
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={sectionTitle}>Scheduling and Work Order</div>

          <div style={twoColumnGrid}>
            <Field fullWidth>
              <label style={fieldLabel}>Service Address</label>
              <input
                name="address"
                placeholder="Address"
                value={form.address}
                onChange={handleChange}
                style={input}
                autoComplete="street-address"
              />
            </Field>

            <Field>
              <label style={fieldLabel}>Scheduled Date and Time</label>
              <input
                type="datetime-local"
                name="scheduled"
                value={form.scheduled}
                onChange={handleChange}
                style={input}
              />
            </Field>

            <Field>
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
            </Field>

            <Field>
              <label style={fieldLabel}>Job Number / PO Number</label>
              <input
                name="po_number"
                placeholder="Job Number or PO Number"
                value={form.po_number}
                onChange={handleChange}
                style={input}
              />
            </Field>
            <Field>
              <label style={fieldLabel}>MO Number</label>
              <input name="mo_number" placeholder="MO Number" value={form.mo_number} onChange={handleChange} style={input} />
            </Field>
          </div>

          <div style={sectionTitle}>Service and Tire Information</div>

          <div style={twoColumnGrid}>
            <Field>
              <label style={fieldLabel}>Tire Position</label>
              <input
                name="tire_position"
                placeholder="Example: Left Front or Rear Axle"
                value={form.tire_position}
                onChange={handleChange}
                style={input}
              />
            </Field>

            <Field>
              <label style={fieldLabel}>Tire Brand or Product</label>
              <input
                name="tires"
                placeholder="Tires"
                value={form.tires}
                onChange={handleChange}
                style={input}
              />
            </Field>

            <Field>
              <label style={fieldLabel}>Tire Size</label>
              <input
                name="size"
                placeholder="Tire Size"
                value={form.size}
                onChange={handleChange}
                style={input}
              />
            </Field>

            <Field>
              <label style={fieldLabel}>Quantity</label>
              <input
                name="qty"
                placeholder="Quantity"
                value={form.qty}
                onChange={handleChange}
                style={input}
                inputMode="numeric"
              />
            </Field>
            <Field fullWidth>
              <label style={fieldLabel}>Tire Product Number</label>
              <input name="tire_product_number" placeholder="Tire Product Number" value={form.tire_product_number} onChange={handleChange} style={input} />
            </Field>
          </div>

          <div style={sectionTitle}>Tire Ordering</div>

          <div style={form.tires_ordered ? orderedStatusCard : notOrderedStatusCard}>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={form.tires_ordered} onChange={(e) => setForm((prev) => ({ ...prev, tires_ordered: e.target.checked }))} style={checkbox} />
              <span>
                <strong>{form.tires_ordered ? "Tires Ordered" : "Tires Not Ordered"}</strong>
                <span style={checkboxHelp}>Check this box after ordering the tires.</span>
              </span>
            </label>
          </div>

          <div style={twoColumnGrid}>
            <Field>
              <label style={fieldLabel}>Tire Supplier</label>
              <input name="tire_supplier" value={form.tire_supplier} onChange={handleChange} style={input} placeholder="Supplier" />
            </Field>
            <Field>
              <label style={fieldLabel}>Estimated Delivery Date</label>
              <input type="date" name="estimated_delivery_date" value={form.estimated_delivery_date} onChange={handleChange} style={input} />
            </Field>
          </div>

          <div style={form.tires_received ? receivedStatusCard : awaitingStatusCard}>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={form.tires_received} onChange={(e) => setForm((prev) => ({ ...prev, tires_received: e.target.checked }))} style={checkbox} />
              <span>
                <strong>{form.tires_received ? "Tires Received" : "Awaiting Tire Delivery"}</strong>
                <span style={checkboxHelp}>Check this box when all tires for the job have arrived.</span>
              </span>
            </label>
          </div>

          <div style={sectionTitle}>Costs</div>

          <div style={twoColumnGrid}>
            <Field>
              <label style={fieldLabel}>Tire Price Each</label>
              <input
                name="price_tires"
                placeholder="Tire Price (each)"
                value={form.price_tires}
                onChange={handleChange}
                style={input}
                inputMode="decimal"
              />
            </Field>

            <Field>
              <label style={fieldLabel}>Installation Cost</label>
              <input
                name="installation_cost"
                placeholder="Total Installation Cost"
                value={form.installation_cost}
                onChange={handleChange}
                style={input}
                inputMode="decimal"
              />
            </Field>

            <Field fullWidth>
              <label style={fieldLabel}>Waste Tire Fee ($4.00 per tire)</label>
              <input
                name="tire_disposal_fee"
                placeholder="Waste Tire Fee"
                value={form.tire_disposal_fee}
                readOnly
                style={{ ...input, background: "#f3f4f6" }}
                inputMode="decimal"
              />
            </Field>
            <Field fullWidth>
              <label style={fieldLabel}>NY State Tire Tax ($2.50 per tire)</label>
              <input name="ny_state_tire_fee" value={form.ny_state_tire_fee} readOnly style={{ ...input, background: "#f3f4f6" }} inputMode="decimal" />
            </Field>
          </div>

          <div style={form.tax_exempt ? taxExemptCard : taxCard}>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={form.tax_exempt} onChange={(e) => setForm((prev) => ({ ...prev, tax_exempt: e.target.checked }))} style={checkbox} />
              <span><strong>Tax-exempt client</strong><span style={checkboxHelp}>No sales tax will be added to this job.</span></span>
            </label>
          </div>

          <div style={twoColumnGrid}>
            <Field fullWidth>
              <label style={fieldLabel}>Service-address sales tax rate (%)</label>
              <input name="sales_tax_rate" value={form.sales_tax_rate} onChange={handleChange} style={{ ...input, background: form.tax_exempt ? "#f3f4f6" : "#fff" }} placeholder="Example: 8.125" inputMode="decimal" disabled={form.tax_exempt} />
            </Field>
          </div>

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
              <span>Waste tire fee</span>
              <strong>
                ${(Number(form.tire_disposal_fee) || 0).toFixed(2)}
              </strong>
            </div>
            <div style={costRow}>
              <span>NY State tire tax (non-taxable)</span>
              <strong>${(Number(form.ny_state_tire_fee) || 0).toFixed(2)}</strong>
            </div>
            <div style={costRow}>
              <span>Sales tax</span>
              <strong>${(form.tax_exempt ? 0 : (((Number(form.qty) || 0) * (Number(form.price_tires) || 0) + (Number(form.installation_cost) || 0) + (Number(form.tire_disposal_fee) || 0)) * ((Number(form.sales_tax_rate) || 0) / 100))).toFixed(2)}</strong>
            </div>

            <div style={costTotalRow}>
              <span>Job Total</span>
              <strong>
                ${(
                  (Number(form.qty) || 0) *
                    (Number(form.price_tires) || 0) +
                  (Number(form.installation_cost) || 0) +
                  (Number(form.tire_disposal_fee) || 0) +
                  (Number(form.ny_state_tire_fee) || 0) +
                  (form.tax_exempt ? 0 : (((Number(form.qty) || 0) * (Number(form.price_tires) || 0) + (Number(form.installation_cost) || 0) + (Number(form.tire_disposal_fee) || 0)) * ((Number(form.sales_tax_rate) || 0) / 100)))
                ).toFixed(2)}
              </strong>
            </div>
          </div>

          <div style={sectionTitle}>Billing</div>

          <div style={twoColumnGrid}>
            <Field>
              <label style={fieldLabel}>Job Total</label>
              <input
                name="job_total"
                value={(
                  (Number(form.qty) || 0) *
                    (Number(form.price_tires) || 0) +
                  (Number(form.installation_cost) || 0) +
                  (Number(form.tire_disposal_fee) || 0) +
                  (Number(form.ny_state_tire_fee) || 0) +
                  (form.tax_exempt ? 0 : (((Number(form.qty) || 0) * (Number(form.price_tires) || 0) + (Number(form.installation_cost) || 0) + (Number(form.tire_disposal_fee) || 0)) * ((Number(form.sales_tax_rate) || 0) / 100)))
                ).toFixed(2)}
                readOnly
                style={{ ...input, background: "#f3f4f6" }}
                inputMode="decimal"
              />
            </Field>

            <Field>
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
            </Field>

            <Field>
              <label style={fieldLabel}>Invoice Number</label>
              <input
                name="invoice_number"
                placeholder="Invoice Number"
                value={form.invoice_number}
                onChange={handleChange}
                style={input}
              />
            </Field>

            <Field>
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
            </Field>
          </div>

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


function Field({
  children,
  fullWidth = false,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div style={fullWidth ? fullWidthField : undefined}>
      {children}
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

const twoColumnGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "0 14px",
};

const fullWidthField: React.CSSProperties = {
  gridColumn: "1 / -1",
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  marginTop: 14,
  marginBottom: -5,
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
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

const notice: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: "#ecfdf5",
  border: "1px solid #bbf7d0",
  color: "#166534",
  fontSize: 14,
  fontWeight: 700,
};

const taxCard: React.CSSProperties = { marginTop: 18, padding: 14, borderRadius: 12, border: "1px solid #bfdbfe", background: "#eff6ff" };
const taxExemptCard: React.CSSProperties = { ...taxCard, border: "1px solid #86efac", background: "#f0fdf4" };
const orderedStatusCard: React.CSSProperties = { ...taxCard, border: "1px solid #86efac", background: "#f0fdf4" };
const notOrderedStatusCard: React.CSSProperties = { ...taxCard, border: "1px solid #fcd34d", background: "#fffbeb" };
const receivedStatusCard: React.CSSProperties = { ...taxCard, border: "1px solid #86efac", background: "#f0fdf4" };
const awaitingStatusCard: React.CSSProperties = { ...taxCard, border: "1px solid #fcd34d", background: "#fffbeb" };
const checkboxLabel: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", color: "#111827" };
const checkbox: React.CSSProperties = { width: 22, height: 22, marginTop: 1 };
const checkboxHelp: React.CSSProperties = { display: "block", marginTop: 3, color: "#6b7280", fontSize: 13, fontWeight: 400 };

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
