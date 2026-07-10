"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";

type CustomerOrder = {
  id: number;
  customer: string;
  contact_name: string;
  contact_number: string;
  address: string;
  requested_date: string;
  requested_time: string;
  job_number: string | null;
  mo_number: string | null;
  qty: number;
  tire_size: string;
  tire_product_number: string | null;
  notes: string | null;
  order_status: string;
  tires_ordered: boolean;
  approved_job_id: number | null;
  submitted_at: string;
};

function formatDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatTime(timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number);

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function createScheduledValue(
  dateValue: string,
  timeValue: string
) {
  const cleanTime = timeValue.substring(0, 5);
  return `${dateValue}T${cleanTime}:00`;
}

export default function OrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("customer_orders")
      .select(`
        id,
        customer,
        contact_name,
        contact_number,
        address,
        requested_date,
        requested_time,
        job_number,
        mo_number,
        qty,
        tire_size,
        tire_product_number,
        notes,
        order_status,
        tires_ordered,
        approved_job_id,
        submitted_at
      `)
      .order("submitted_at", { ascending: false });

    setLoading(false);

    if (error) {
      setErrorMessage(`Error loading orders: ${error.message}`);
      return;
    }

    setOrders((data || []) as CustomerOrder[]);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const toggleTiresOrdered = async (order: CustomerOrder) => {
    if (workingId !== null) return;

    setWorkingId(order.id);
    setErrorMessage("");

    const newValue = !order.tires_ordered;

    const { error } = await supabase
      .from("customer_orders")
      .update({
        tires_ordered: newValue,
      })
      .eq("id", order.id);

    setWorkingId(null);

    if (error) {
      setErrorMessage(
        `Error updating tire status: ${error.message}`
      );
      return;
    }

    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? { ...item, tires_ordered: newValue }
          : item
      )
    );
  };

  const rejectOrder = async (order: CustomerOrder) => {
    if (workingId !== null) return;

    const confirmed = window.confirm(
      `Reject the request from ${order.contact_name}?`
    );

    if (!confirmed) return;

    setWorkingId(order.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("customer_orders")
      .update({
        order_status: "rejected",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    setWorkingId(null);

    if (error) {
      setErrorMessage(
        `Error rejecting order: ${error.message}`
      );
      return;
    }

    await fetchOrders();
  };

  const deleteOrder = async (order: CustomerOrder) => {
    if (workingId !== null) return;

    const approvedMessage = order.approved_job_id
      ? "\n\nThe approved job will remain in Jobs."
      : "";

    const confirmed = window.confirm(
      `Permanently delete this order from ${order.contact_name}?${approvedMessage}`
    );

    if (!confirmed) return;

    setWorkingId(order.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("customer_orders")
      .delete()
      .eq("id", order.id);

    setWorkingId(null);

    if (error) {
      setErrorMessage(
        `Error deleting order: ${error.message}`
      );
      return;
    }

    setOrders((current) =>
      current.filter((item) => item.id !== order.id)
    );
  };

  const approveOrder = async (order: CustomerOrder) => {
    if (workingId !== null) return;

    if (order.approved_job_id) {
      router.push(`/jobs/${order.approved_job_id}`);
      return;
    }

    const confirmed = window.confirm(
      `Approve this request and add it to the schedule for ${formatDate(
        order.requested_date
      )} at ${formatTime(order.requested_time)}?`
    );

    if (!confirmed) return;

    setWorkingId(order.id);
    setErrorMessage("");

    const scheduled = createScheduledValue(
      order.requested_date,
      order.requested_time
    );

    const { data: newJob, error: jobError } = await supabase
      .from("jobs")
      .insert({
        customer: "Kingdom Support Services",
        billing_name: "Kingdom Support Services",
        contact_name: order.contact_name,
        phone: order.contact_number,
        address: order.address,
        scheduled,
        po_number: order.job_number,
        mo_number: order.mo_number,
        qty: order.qty,
        size: order.tire_size,
        tire_product_number: order.tire_product_number,
        notes: order.notes,
        tires_ordered: order.tires_ordered,
        submitted_by_customer: true,
        customer_order_status: "approved",
        vehicle_id: "stepvan",
        service_type: "new tires",
        payment_status: "unpaid",
        job_status: "scheduled",
        complete: false,
        archived: false,
      })
      .select("id")
      .single();

    if (jobError || !newJob) {
      setWorkingId(null);
      setErrorMessage(
        `Error creating job: ${
          jobError?.message || "No job was returned."
        }`
      );
      return;
    }

    const { error: orderError } = await supabase
      .from("customer_orders")
      .update({
        order_status: "approved",
        approved_job_id: newJob.id,
        reviewed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    setWorkingId(null);

    if (orderError) {
      setErrorMessage(
        `The job was created, but the order could not be updated: ${orderError.message}`
      );

      router.push(`/jobs/${newJob.id}`);
      return;
    }

    router.push(`/jobs/${newJob.id}`);
    router.refresh();
  };

  const newOrders = orders.filter(
    (order) => order.order_status === "new"
  );

  const approvedOrders = orders.filter(
    (order) => order.order_status === "approved"
  );

  const rejectedOrders = orders.filter(
    (order) => order.order_status === "rejected"
  );

  return (
    <div style={shell}>
      <AppHeader />

      <main style={page}>
        <section style={heroCard}>
          <div>
            <div style={eyebrow}>Customer Requests</div>

            <h1 style={title}>Orders</h1>

            <p style={subtitle}>
              Review Kingdom Support Services requests and
              approve them into your schedule.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchOrders}
            style={refreshButton}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </section>

        {errorMessage && (
          <div style={errorBox}>{errorMessage}</div>
        )}

        {loading ? (
          <div style={emptyCard}>Loading orders...</div>
        ) : (
          <>
            <OrderSection
              title={`New Orders (${newOrders.length})`}
              orders={newOrders}
              emptyText="No new customer orders."
              workingId={workingId}
              onToggleTires={toggleTiresOrdered}
              onApprove={approveOrder}
              onReject={rejectOrder}
              onDelete={deleteOrder}
              router={router}
            />

            <OrderSection
              title={`Approved Orders (${approvedOrders.length})`}
              orders={approvedOrders}
              emptyText="No approved orders yet."
              workingId={workingId}
              onToggleTires={toggleTiresOrdered}
              onApprove={approveOrder}
              onReject={rejectOrder}
              onDelete={deleteOrder}
              router={router}
            />

            {rejectedOrders.length > 0 && (
              <OrderSection
                title={`Rejected Orders (${rejectedOrders.length})`}
                orders={rejectedOrders}
                emptyText="No rejected orders."
                workingId={workingId}
                onToggleTires={toggleTiresOrdered}
                onApprove={approveOrder}
                onReject={rejectOrder}
                onDelete={deleteOrder}
                router={router}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

type OrderSectionProps = {
  title: string;
  orders: CustomerOrder[];
  emptyText: string;
  workingId: number | null;
  onToggleTires: (order: CustomerOrder) => void;
  onApprove: (order: CustomerOrder) => void;
  onReject: (order: CustomerOrder) => void;
  onDelete: (order: CustomerOrder) => void;
  router: ReturnType<typeof useRouter>;
};

function OrderSection({
  title,
  orders,
  emptyText,
  workingId,
  onToggleTires,
  onApprove,
  onReject,
  onDelete,
  router,
}: OrderSectionProps) {
  return (
    <section style={section}>
      <h2 style={sectionTitle}>{title}</h2>

      {orders.length === 0 ? (
        <div style={emptyCard}>{emptyText}</div>
      ) : (
        <div style={orderGrid}>
          {orders.map((order) => {
            const working = workingId === order.id;
            const approved =
              order.order_status === "approved";
            const rejected =
              order.order_status === "rejected";

            return (
              <article key={order.id} style={orderCard}>
                <div style={cardTop}>
                  <div>
                    <span
                      style={
                        approved
                          ? approvedBadge
                          : rejected
                            ? rejectedBadge
                            : newBadge
                      }
                    >
                      {approved
                        ? "Approved"
                        : rejected
                          ? "Rejected"
                          : "New Order"}
                    </span>

                    <h3 style={customerName}>
                      {order.customer}
                    </h3>

                    <div style={contactName}>
                      {order.contact_name}
                    </div>
                  </div>

                  <div
                    style={
                      order.tires_ordered
                        ? tiresOrderedBadge
                        : tiresNotOrderedBadge
                    }
                  >
                    {order.tires_ordered
                      ? "Tires Ordered"
                      : "Not Ordered"}
                  </div>
                </div>

                <div style={appointmentBox}>
                  <strong>
                    {formatDate(order.requested_date)}
                  </strong>

                  <span>
                    {formatTime(order.requested_time)}
                  </span>
                </div>

                <div style={detailsGrid}>
                  <Detail
                    label="Tires"
                    value={`${order.qty} × ${order.tire_size}`}
                  />

                  <Detail
                    label="Product Number"
                    value={
                      order.tire_product_number || "—"
                    }
                  />

                  <Detail
                    label="Job Number"
                    value={order.job_number || "—"}
                  />

                  <Detail
                    label="MO Number"
                    value={order.mo_number || "—"}
                  />
                </div>

                <div style={addressBox}>
                  <strong>Service Address</strong>
                  <span>{order.address}</span>
                </div>

                {order.notes && (
                  <div style={notesBox}>
                    <strong>Notes</strong>
                    <span>{order.notes}</span>
                  </div>
                )}

                <div style={quickLinks}>
                  <a
                    href={`tel:${order.contact_number}`}
                    style={linkButton}
                  >
                    Call
                  </a>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      order.address
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    style={linkButton}
                  >
                    Maps
                  </a>
                </div>

                <label style={checkboxRow}>
                  <input
                    type="checkbox"
                    checked={order.tires_ordered}
                    onChange={() => onToggleTires(order)}
                    disabled={working}
                    style={checkbox}
                  />

                  Tires have been ordered
                </label>

                <div style={actions}>
                  {approved && order.approved_job_id ? (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/jobs/${order.approved_job_id}`
                        )
                      }
                      style={openJobButton}
                    >
                      Open Job
                    </button>
                  ) : order.order_status === "new" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onApprove(order)}
                        disabled={working}
                        style={approveButton}
                      >
                        {working
                          ? "Working..."
                          : "Approve & Create Job"}
                      </button>

                      <button
                        type="button"
                        onClick={() => onReject(order)}
                        disabled={working}
                        style={rejectButton}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => onDelete(order)}
                    disabled={working}
                    style={deleteButton}
                  >
                    {working ? "Working..." : "Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={detail}>
      <span style={detailLabel}>{label}</span>
      <strong style={detailValue}>{value}</strong>
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
};

const page: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 20,
};

const heroCard: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  padding: 20,
  marginBottom: 18,
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "white",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const eyebrow: React.CSSProperties = {
  marginBottom: 5,
  color: "#2563eb",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  color: "#111827",
};

const subtitle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#4b5563",
  lineHeight: 1.5,
};

const refreshButton: React.CSSProperties = {
  padding: "10px 14px",
  border: "none",
  borderRadius: 9,
  background: "#e5e7eb",
  color: "#111827",
  cursor: "pointer",
  fontWeight: 700,
};

const section: React.CSSProperties = {
  marginTop: 24,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 21,
  color: "#111827",
};

const orderGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(min(100%, 390px), 1fr))",
  gap: 16,
};

const orderCard: React.CSSProperties = {
  padding: 18,
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "white",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
};

const customerName: React.CSSProperties = {
  margin: "8px 0 2px",
  fontSize: 19,
  color: "#111827",
};

const contactName: React.CSSProperties = {
  color: "#4b5563",
  fontSize: 14,
};

const newBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: 999,
  background: "#fef3c7",
  color: "#92400e",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
};

const approvedBadge: React.CSSProperties = {
  ...newBadge,
  background: "#dcfce7",
  color: "#166534",
};

const rejectedBadge: React.CSSProperties = {
  ...newBadge,
  background: "#fee2e2",
  color: "#991b1b",
};

const tiresOrderedBadge: React.CSSProperties = {
  padding: "6px 9px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tiresNotOrderedBadge: React.CSSProperties = {
  ...tiresOrderedBadge,
  background: "#fef3c7",
  color: "#92400e",
};

const appointmentBox: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 16,
  padding: 12,
  borderRadius: 10,
  background: "#eff6ff",
  color: "#1e3a8a",
};

const detailsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginTop: 14,
};

const detail: React.CSSProperties = {
  padding: 10,
  borderRadius: 9,
  background: "#f8fafc",
};

const detailLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#6b7280",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
};

const detailValue: React.CSSProperties = {
  color: "#111827",
  fontSize: 14,
  overflowWrap: "anywhere",
};

const addressBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginTop: 14,
  color: "#374151",
  fontSize: 14,
};

const notesBox: React.CSSProperties = {
  ...addressBox,
  padding: 10,
  borderRadius: 9,
  background: "#f8fafc",
};

const quickLinks: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 14,
};

const linkButton: React.CSSProperties = {
  padding: "8px 11px",
  borderRadius: 8,
  background: "#e5e7eb",
  color: "#111827",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  marginTop: 16,
  padding: 11,
  borderRadius: 9,
  background: "#f8fafc",
  color: "#374151",
  cursor: "pointer",
  fontWeight: 700,
};

const checkbox: React.CSSProperties = {
  width: 19,
  height: 19,
};

const actions: React.CSSProperties = {
  display: "flex",
  gap: 9,
  flexWrap: "wrap",
  marginTop: 16,
};

const approveButton: React.CSSProperties = {
  flex: 1,
  minWidth: 180,
  padding: "11px 13px",
  border: "none",
  borderRadius: 9,
  background: "#16a34a",
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const openJobButton: React.CSSProperties = {
  ...approveButton,
  background: "#2563eb",
};

const rejectButton: React.CSSProperties = {
  padding: "11px 13px",
  border: "none",
  borderRadius: 9,
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const deleteButton: React.CSSProperties = {
  padding: "11px 13px",
  borderRadius: 9,
  border: "1px solid #dc2626",
  background: "white",
  color: "#dc2626",
  cursor: "pointer",
  fontWeight: 800,
};

const emptyCard: React.CSSProperties = {
  padding: 24,
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "white",
  color: "#6b7280",
  textAlign: "center",
};

const errorBox: React.CSSProperties = {
  marginBottom: 16,
  padding: 13,
  border: "1px solid #fecaca",
  borderRadius: 10,
  background: "#fef2f2",
  color: "#991b1b",
  fontWeight: 600,
};