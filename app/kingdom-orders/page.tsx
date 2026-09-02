"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import KingdomPortalGate from "@/components/KingdomPortalGate";

type Order = {
  id: number; customer: "Kingdom Support Services" | "HPR"; submitted_at: string; requested_date: string; requested_time: string;
  goodyear_order: boolean | null;
  service_method: "installed" | "delivery" | "pickup" | "delivery_pickup" | null;
  job_number: string | null; mo_number: string | null; vehicle_year: string; vehicle_make: string;
  vehicle_model: string; vehicle_color: string | null; tire_position: string; qty: number;
  license_plate: string | null; notes: string | null; tire_size: string; tire_product_number: string | null; order_status: string; tires_ordered: boolean;
  approved_job_id: number | null; job: null | { scheduled: string | null; job_status: string | null; complete: boolean; completed_at: string | null };
};

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00`)) : "Not scheduled";
const status = (o: Order) => o.job?.complete ? "Completed" : o.order_status === "cancellation_requested" ? "Cancellation Requested" : o.job?.job_status === "en_route" ? "En Route" : o.job?.job_status === "on_site" ? "On Site" : o.order_status === "new" ? "Pending Review" : o.order_status === "rejected" ? "Not Approved" : "Scheduled";

export default function KingdomOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { fetch("/api/public/kingdom/orders", { cache: "no-store" }).then(async r => { const x = await r.json(); if (!r.ok) throw new Error(x.error); setOrders(x); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const visible = useMemo(() => orders.filter(order => {
    const s = status(order).toLowerCase();
    if (filter === "open" && ["completed", "not approved"].includes(s)) return false;
    if (filter === "completed" && s !== "completed") return false;
    if (filter === "rejected" && s !== "not approved") return false;
    const haystack = [order.customer, order.job_number, order.mo_number, order.service_method, order.vehicle_year, order.vehicle_make, order.vehicle_model, order.vehicle_color, order.tire_size, order.tire_product_number, s].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [orders, query, filter]);

  return <KingdomPortalGate><main style={shell}><header style={header}><div style={headerInner}><img src="/bolt-logo.png" alt="Bolt Tire" style={logo}/><div><strong>Bolt Tire</strong><div style={muted}>Watchtower Portal</div></div></div></header><div style={content}>
    <section style={hero}><div style={eyebrow}>Watchtower</div><h1 style={title}>Order Tracking</h1><p style={subtitle}>Search current requests and past tire-service orders by organization, Job/PO number, MO number, vehicle, tire size, or status.</p><div style={actions}><Link href="/order/kingdom" style={primary}>Submit New Request</Link><Link href="/kingdom-schedule" style={secondary}>Upcoming Schedule</Link></div></section>
    <section style={toolbar}><input aria-label="Search orders" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Job/PO, MO, vehicle, tire size..." style={search}/><select aria-label="Filter order status" value={filter} onChange={e=>setFilter(e.target.value)} style={select}><option value="all">All orders</option><option value="open">Current / open</option><option value="completed">Completed</option><option value="rejected">Not approved</option></select></section>
    {loading?<div style={message}>Loading orders...</div>:error?<div style={errorCard}>{error}</div>:visible.length===0?<div style={message}>No matching orders found.</div>:<div style={list}>{visible.map(order=><Link key={order.id} href={`/kingdom-orders/${order.id}`} style={cardLink}><div style={cardHead}><div><div style={reference}>{order.job_number?`Job/PO ${order.job_number}`:`Request #${order.id}`}</div><div style={muted}>{order.mo_number?`MO ${order.mo_number}`:"No MO number"}</div></div><span style={{...badge,...(status(order)==="Completed"?doneBadge:status(order)==="Not Approved"?rejectedBadge:openBadge)}}>{status(order)}</span></div><div style={grid}><Detail label="Organization" value={order.customer}/><Detail label="Goodyear Order" value={order.goodyear_order?"Yes":"No"}/><Detail label="Order Type" value={order.service_method==="pickup"?"Pickup":order.service_method==="delivery"?"Delivery":order.service_method==="delivery_pickup"?"Delivery / Pickup":"Installed"}/><Detail label="Vehicle" value={[order.vehicle_year,order.vehicle_make,order.vehicle_model,order.vehicle_color].filter(Boolean).join(" ")}/><Detail label="Tires" value={`${order.qty} × ${order.tire_size}${order.tire_product_number?` • ${order.tire_product_number}`:""}`}/><Detail label="Position" value={order.tire_position||"Not provided"}/><Detail label={order.job?.complete?"Completed":"Requested"} value={formatDate(order.job?.completed_at||order.job?.scheduled||order.requested_date)}/></div><div style={viewOrder}>View Order →</div></Link>)}</div>}
    <p style={privacy}>Contact information, service addresses, pricing, and internal notes are not shown here.</p>
  </div></main></KingdomPortalGate>;
}

function Detail({label,value}:{label:string;value:string}){return <div style={detail}><div style={detailLabel}>{label}</div><div style={detailValue}>{value||"Not provided"}</div></div>}
const shell:React.CSSProperties={minHeight:"100vh",background:"#f8fafc",color:"#111827"};
const header:React.CSSProperties={background:"#fff",borderBottom:"1px solid #e5e7eb"};
const headerInner:React.CSSProperties={maxWidth:960,margin:"0 auto",padding:"12px 18px",display:"flex",alignItems:"center",gap:12};
const logo:React.CSSProperties={height:44,width:"auto"};const muted:React.CSSProperties={color:"#64748b",fontSize:13,marginTop:3};
const content:React.CSSProperties={maxWidth:960,margin:"0 auto",padding:"22px 16px 48px"};
const hero:React.CSSProperties={padding:22,border:"1px solid #e2e8f0",borderRadius:18,background:"#fff",boxShadow:"0 3px 12px rgba(15,23,42,.06)"};
const eyebrow:React.CSSProperties={fontSize:12,fontWeight:800,letterSpacing:.6,textTransform:"uppercase",color:"#2563eb"};
const title:React.CSSProperties={fontSize:32,margin:"7px 0 0"};const subtitle:React.CSSProperties={color:"#475569",lineHeight:1.6,maxWidth:720};
const actions:React.CSSProperties={display:"flex",gap:10,flexWrap:"wrap",marginTop:16};const primary:React.CSSProperties={padding:"11px 15px",borderRadius:10,background:"#2563eb",color:"white",fontWeight:800,textDecoration:"none"};
const secondary:React.CSSProperties={...primary,background:"#e2e8f0",color:"#0f172a"};
const toolbar:React.CSSProperties={display:"grid",gridTemplateColumns:"minmax(0,1fr) 180px",gap:10,margin:"16px 0"};
const search:React.CSSProperties={padding:"13px 14px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:16};const select:React.CSSProperties={...search,background:"white"};
const list:React.CSSProperties={display:"grid",gap:12};const card:React.CSSProperties={padding:18,border:"1px solid #e2e8f0",borderRadius:15,background:"white"};
const cardLink:React.CSSProperties={...card,display:"block",color:"inherit",textDecoration:"none",cursor:"pointer"};
const cardHead:React.CSSProperties={display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",paddingBottom:13,borderBottom:"1px solid #e2e8f0"};
const reference:React.CSSProperties={fontSize:18,fontWeight:850};const badge:React.CSSProperties={padding:"7px 10px",borderRadius:999,fontWeight:800,fontSize:12,border:"1px solid"};
const doneBadge:React.CSSProperties={background:"#ecfdf5",color:"#166534",borderColor:"#bbf7d0"};const rejectedBadge:React.CSSProperties={background:"#fef2f2",color:"#991b1b",borderColor:"#fecaca"};const openBadge:React.CSSProperties={background:"#eff6ff",color:"#1d4ed8",borderColor:"#bfdbfe"};
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:13};const detail:React.CSSProperties={padding:11,borderRadius:9,background:"#f8fafc"};
const detailLabel:React.CSSProperties={fontSize:11,fontWeight:800,textTransform:"uppercase",color:"#64748b"};const detailValue:React.CSSProperties={fontSize:14,fontWeight:650,marginTop:4};
const message:React.CSSProperties={padding:30,textAlign:"center",background:"white",borderRadius:14,border:"1px solid #e2e8f0"};const errorCard:React.CSSProperties={...message,color:"#991b1b",background:"#fef2f2"};const privacy:React.CSSProperties={textAlign:"center",fontSize:12,color:"#64748b",marginTop:18};
const viewOrder:React.CSSProperties={marginTop:13,color:"#2563eb",fontWeight:800,fontSize:13,textAlign:"right"};
