"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import SalePaymentStatus from "@/components/SalePaymentStatus";
import { supabase } from "@/lib/supabase";
import { tireShopSalePath, saleServiceLabel, type SalePayment } from "@/lib/tire-shop-sales";

type Sale = SalePayment & {
  id: string; quote_number: number; customer: string; vehicle: string | null; tire_size: string | null;
  quantity: number; rear_quantity: number | null; created_at: string; converted_job_id: string | null;
  checkout_service: string | null; selected_option_id: string | null;
  quote_options: Array<{ id: string; brand: string; model: string; supplier_product_id: string | null }>;
};
const filters = { all: "All sales", paid: "Paid", pending: "Payment pending", unpaid: "Not paid", refunded: "Refunded" };
export default function TireShopSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [filter, setFilter] = useState<keyof typeof filters>("all");
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState("");
  useEffect(() => {
    let active = true, version = 0;
    const load = async () => {
      const request = ++version;
      setLoading(true); setError("");
      try {
        let query = supabase.from("quotes").select("id,quote_number,customer,vehicle,tire_size,quantity,rear_quantity,created_at,converted_job_id,checkout_service,selected_option_id,payment_status,amount_paid,paid_at,quote_options!quote_options_quote_id_fkey(id,brand,model,supplier_product_id)", { count: "exact" }).eq("purchase_source", "website");
        if (filter === "unpaid") query = query.or("payment_status.is.null,payment_status.eq.unpaid");
        else if (filter !== "all") query = query.eq("payment_status", filter);
        const result = await query.order("created_at", { ascending: false }).range(0, limit - 1);
        if (!active || request !== version) return;
        if (result.error) throw result.error;
        setSales((result.data || []) as Sale[]); setTotal(result.count || 0); setChecked(new Date().toLocaleTimeString());
      } catch (reason) {
        if (!active || request !== version) return;
        setSales([]); setChecked(""); setError(reason instanceof Error ? reason.message : "Could not check sales and payments. Refresh to try again.");
      } finally { if (active && request === version) setLoading(false); }
    };
    void load();
    const visibleRefresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(visibleRefresh, 30000);
    window.addEventListener("focus", visibleRefresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", visibleRefresh); };
  }, [filter, limit, refresh]);
  return <div className="quote-shell"><AppHeader /><main className="quote-page">
    <div className="quote-page-header"><div><div className="quote-eyebrow">Website purchases</div><h1>Tire Shop Sales</h1><p>Online sales and unfinished checkouts, separate from quotes. Only confirmed payments show as Paid.</p></div><button className="quote-primary" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? "Checking…" : "Refresh payments"}</button></div>
    <div className="quote-filter-row">{Object.entries(filters).map(([key, label]) => <button key={key} className={`quote-filter ${filter === key ? "active" : ""}`} onClick={() => { setFilter(key as keyof typeof filters); setLimit(50); }}>{label}</button>)}</div>
    {checked && <p>Payment records checked at {checked}. Updates automatically while this page is open.</p>}
    {error && <p role="alert" className="quote-error">{error}</p>}
    {!loading && !error && !sales.length && <div className="quote-empty">No sales in this payment category.</div>}
    <div className="quote-list">{sales.map(sale => {
      const tire = sale.quote_options.find(option => option.id === sale.selected_option_id);
      return <Link href={tireShopSalePath(sale.id)} className="quote-list-card" style={{ boxSizing: "border-box", color: "inherit", textDecoration: "none", gap: 16, flexWrap: "wrap" }} key={sale.id}>
        <div><div className="quote-number">Tire Shop Sale · BT-{sale.quote_number}</div><h2>{sale.customer}</h2><p>{[tire && `${tire.brand} ${tire.model}`, sale.tire_size, `${Number(sale.quantity) + Number(sale.rear_quantity || 0)} tires`].filter(Boolean).join(" · ")}</p><p>{sale.vehicle}</p><p>{saleServiceLabel(sale.checkout_service)}{sale.converted_job_id ? ` · Job #${sale.converted_job_id}` : ""}</p></div>
        <div className="quote-list-meta"><SalePaymentStatus record={sale} compact /><span>{new Date(sale.created_at).toLocaleDateString()}</span><span>View sale →</span></div>
      </Link>;
    })}</div>
    {!error && sales.length < total && <button className="quote-primary" disabled={loading} onClick={() => setLimit(value => value + 50)} style={{ marginTop: 16 }}>Load more sales ({sales.length} of {total})</button>}
  </main></div>;
}
