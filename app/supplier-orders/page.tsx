"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";

type SupplierOrder = {
  id: string; supplier: string; productNumber: string; productDescription: string | null;
  quantity: number; total: number | null; confirmationNumber: string | null; status: string;
  poNumber: string | null; notes: string | null; createdAt: string; placedBy: string;
  fulfillmentStatus: string | null; expectedDelivery: string | null; source: string | null; shipMethod: string | null;
};

function money(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function delivery(value: string | null) {
  if (!value) return "Not provided";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

export default function SupplierOrdersPage() {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Please sign in again."); setLoading(false); return; }
    const response = await fetch("/api/supplier-orders", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) setError(body.error || "Could not load supplier orders.");
    else setOrders(body.orders || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statuses = useMemo(() => [...new Set(orders.map((order) => order.status).filter(Boolean))], [orders]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (status !== "all" && order.status !== status) return false;
      if (!query) return true;
      return [order.confirmationNumber, order.supplier, order.productNumber, order.productDescription, order.poNumber, order.placedBy]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [orders, search, status]);

  return <div style={shell}>
    <AppHeader />
    <main style={page}>
      <section style={hero}>
        <div><div style={eyebrow}>PURCHASING</div><h1 style={title}>Supplier Orders</h1><p style={subtitle}>Track tire orders from every distributor in one place.</p></div>
        <button type="button" style={refresh} onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh orders"}</button>
      </section>

      <section style={filters}>
        <label style={field}><span style={label}>Search orders</span><input style={input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Confirmation, product, Job/PO, employee…" /></label>
        <label style={{ ...field, maxWidth: 230 }}><span style={label}>Status</span><select style={input} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </section>

      {error && <div style={errorBox}>{error}</div>}
      {loading ? <div style={empty}>Loading supplier orders…</div> : visible.length === 0 ? <div style={empty}><h2 style={{ margin: 0 }}>No supplier orders found</h2><p style={{ marginBottom: 0 }}>Orders placed from Tire Shop will appear here automatically.</p></div> :
        <div style={list}>{visible.map((order) => <article key={order.id} style={card}>
          <div style={cardTop}>
            <div><div style={supplier}>{order.supplier}</div><h2 style={product}>{order.productDescription || `Product ${order.productNumber}`}</h2><div style={muted}>Product #{order.productNumber}</div></div>
            <span style={{ ...badge, ...(order.status === "placed" ? placedBadge : order.status === "failed" ? failedBadge : pendingBadge) }}>{order.status}</span>
          </div>
          <div style={grid}>
            <Info label="Confirmation" value={order.confirmationNumber || "Pending"} strong />
            <Info label="Quantity" value={String(order.quantity)} />
            <Info label="Order total" value={money(order.total)} strong />
            <Info label="Job / PO" value={order.poNumber || "Not linked"} />
            <Info label="Expected delivery" value={delivery(order.expectedDelivery)} />
            <Info label="Fulfillment" value={[order.fulfillmentStatus, order.source, order.shipMethod].filter(Boolean).join(" • ") || "Awaiting supplier details"} />
            <Info label="Ordered" value={dateTime(order.createdAt)} />
            <Info label="Placed by" value={order.placedBy} />
          </div>
          {order.notes && <div style={note}><b>Order note:</b> {order.notes}</div>}
        </article>)}</div>}
    </main>
  </div>;
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div style={info}><div style={infoLabel}>{label}</div><div style={{ ...infoValue, fontWeight: strong ? 800 : 650 }}>{value}</div></div>;
}

const shell: React.CSSProperties = { minHeight: "100vh", background: "#f3f6fa", color: "#111827" };
const page: React.CSSProperties = { maxWidth: 1200, margin: "0 auto", padding: "34px 18px 70px" };
const hero: React.CSSProperties = { display: "flex", alignItems: "end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 24 };
const eyebrow: React.CSSProperties = { color: "#2563eb", fontWeight: 900, fontSize: 13, letterSpacing: 1.2 };
const title: React.CSSProperties = { fontSize: 42, lineHeight: 1, margin: "8px 0 10px", letterSpacing: -1.5 };
const subtitle: React.CSSProperties = { margin: 0, color: "#5b6b83", fontSize: 17 };
const refresh: React.CSSProperties = { border: 0, borderRadius: 10, background: "#2563eb", color: "white", padding: "12px 17px", fontWeight: 800, cursor: "pointer" };
const filters: React.CSSProperties = { background: "white", border: "1px solid #dbe3ee", borderRadius: 16, padding: 16, display: "flex", gap: 14, marginBottom: 18, boxShadow: "0 5px 18px rgba(15,23,42,.04)" };
const field: React.CSSProperties = { display: "grid", gap: 6, flex: 1 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 850, color: "#526078", textTransform: "uppercase", letterSpacing: .5 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 9, padding: "11px 12px", background: "white", fontSize: 15 };
const list: React.CSSProperties = { display: "grid", gap: 14 };
const card: React.CSSProperties = { background: "white", border: "1px solid #dbe3ee", borderRadius: 16, padding: 20, boxShadow: "0 5px 18px rgba(15,23,42,.04)" };
const cardTop: React.CSSProperties = { display: "flex", alignItems: "start", justifyContent: "space-between", gap: 18, borderBottom: "1px solid #e5eaf1", paddingBottom: 14, marginBottom: 14 };
const supplier: React.CSSProperties = { color: "#2563eb", fontWeight: 900, fontSize: 13, letterSpacing: .7 };
const product: React.CSSProperties = { margin: "4px 0", fontSize: 21 };
const muted: React.CSSProperties = { color: "#64748b", fontSize: 14 };
const badge: React.CSSProperties = { borderRadius: 999, padding: "7px 11px", fontSize: 12, fontWeight: 900, textTransform: "capitalize" };
const placedBadge: React.CSSProperties = { background: "#dcfce7", color: "#166534" };
const failedBadge: React.CSSProperties = { background: "#fee2e2", color: "#991b1b" };
const pendingBadge: React.CSSProperties = { background: "#fef3c7", color: "#92400e" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const info: React.CSSProperties = { background: "#f7f9fc", border: "1px solid #edf1f6", borderRadius: 10, padding: "11px 12px", minWidth: 0 };
const infoLabel: React.CSSProperties = { color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: .5, fontWeight: 850, marginBottom: 4 };
const infoValue: React.CSSProperties = { overflowWrap: "anywhere" };
const note: React.CSSProperties = { marginTop: 12, color: "#475569", background: "#fff9e8", borderRadius: 9, padding: 11 };
const empty: React.CSSProperties = { background: "white", border: "1px dashed #cbd5e1", borderRadius: 16, padding: 45, textAlign: "center", color: "#64748b" };
const errorBox: React.CSSProperties = { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 12, padding: 14, marginBottom: 16 };
