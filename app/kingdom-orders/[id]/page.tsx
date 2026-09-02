"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import KingdomPortalGate from "@/components/KingdomPortalGate";

type EditableOrder = {
  id: number; customer: "Kingdom Support Services" | "HPR"; goodyear_order: boolean; service_method: "installed" | "delivery" | "pickup" | "delivery_pickup" | null;
  submitted_by: string; contact_name: string; contact_number: string;
  facility_id: number | null; facility_name: string | null; address: string;
  requested_date: string; requested_time: string;
  vehicle_year: string; vehicle_make: string; vehicle_model: string; vehicle_color: string | null;
  license_plate: string | null; job_number: string | null; mo_number: string | null;
  tire_position: string | null; qty: number; tire_size: string; tire_product_number: string | null;
  notes: string | null; order_status: string;
  job: null | { complete: boolean; completed_at: string | null };
};

type Facility = { id: number; name: string; address: string; contact_name: string | null; contact_number: string | null };

export default function KingdomOrderEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [order, setOrder] = useState<EditableOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    fetch("/api/public/kingdom/orders", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Order could not be loaded.");
      const match = result.find((item: EditableOrder) => String(item.id) === String(id));
      if (!match) throw new Error("Order not found.");
      setOrder({ ...match, service_method: match.service_method || "installed" });
    }).catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch("/api/public/kingdom/facilities", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then(setFacilities);
  }, []);

  const change = (name: keyof EditableOrder, value: string | number | boolean) => setOrder((current) => current ? { ...current, [name]: value } : current);
  const selectFacility = (value: string) => {
    const facility = facilities.find((item) => String(item.id) === value);
    setOrder((current) => current && facility ? { ...current, facility_id: facility.id, facility_name: facility.name, address: facility.address, contact_name: facility.contact_name || "", contact_number: facility.contact_number || "" } : current);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!order || order.job?.complete) return;
    setWorking(true); setMessage("");
    const response = await fetch(`/api/public/kingdom/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) });
    const result = await response.json(); setWorking(false);
    if (!response.ok) return setMessage(result.error || "Order could not be saved.");
    setMessage("Order changes saved.");
  };

  const requestCancellation = async () => {
    if (!order || order.job?.complete || !window.confirm("Request cancellation of this order? Bolt Tire will review the request.")) return;
    setWorking(true); setMessage("");
    const response = await fetch(`/api/public/kingdom/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request_cancellation" }) });
    const result = await response.json(); setWorking(false);
    if (!response.ok) return setMessage(result.error || "Cancellation could not be requested.");
    router.push("/kingdom-orders"); router.refresh();
  };

  return <KingdomPortalGate><main style={shell}><div style={page}><Link href="/kingdom-orders" style={back}>← Back to Orders</Link>
    {loading ? <div style={card}>Loading order...</div> : !order ? <div style={errorCard}>{message || "Order not found."}</div> : <form onSubmit={save} style={card}>
      <div style={eyebrow}>Watchtower</div><h1 style={title}>Edit {order.job_number ? `Job/PO ${order.job_number}` : `Request #${order.id}`}</h1>
      {order.job?.complete ? <div style={completeBanner}>This job is completed and can no longer be changed or cancelled.</div> : null}
      {order.order_status === "cancellation_requested" ? <div style={cancelBanner}>Cancellation has been requested. Bolt Tire will review it.</div> : null}
      {message ? <div style={notice}>{message}</div> : null}

      <label style={label}>Organization<select value={order.customer} onChange={(event) => change("customer", event.target.value)} style={input}><option value="Kingdom Support Services">Kingdom Support Services</option><option value="HPR">HPR</option></select></label>
      <label style={checkRow}><input type="checkbox" checked={order.goodyear_order} onChange={(event) => change("goodyear_order", event.target.checked)} /> Goodyear order?</label>
      <div style={choices}><label style={choice}><input type="radio" checked={order.service_method === "installed"} onChange={() => change("service_method", "installed")} /> Installed</label><label style={choice}><input type="radio" checked={order.service_method === "delivery"} onChange={() => change("service_method", "delivery")} /> Delivery</label><label style={choice}><input type="radio" checked={order.service_method === "pickup"} onChange={() => change("service_method", "pickup")} /> Pickup</label></div>

      <h2 style={sectionTitle}>Contact & Facility</h2>
      <label style={label}>Facility<select value={order.facility_id || ""} onChange={(event) => selectFacility(event.target.value)} style={input}><option value="">Choose facility</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></label>
      <Field label="Service Address" value={order.address || ""} onChange={(value) => change("address", value)} />
      <div style={grid2}><Field label="Submitted By" value={order.submitted_by || ""} onChange={(value) => change("submitted_by", value)} /><Field label="Contact Person" value={order.contact_name || ""} onChange={(value) => change("contact_name", value)} /><Field label="Contact Number" type="tel" value={order.contact_number || ""} onChange={(value) => change("contact_number", value)} /></div>

      <h2 style={sectionTitle}>Appointment</h2><div style={grid2}><Field label="Requested Date" type="date" value={order.requested_date} onChange={(value) => change("requested_date", value)} /><label style={label}>Requested Time<select value={(order.requested_time || "").substring(0,5)} onChange={(event) => change("requested_time", event.target.value)} style={input}><option value="08:00">8:00 AM</option><option value="09:30">9:30 AM</option><option value="11:00">11:00 AM</option><option value="12:30">12:30 PM</option><option value="14:00">2:00 PM</option></select></label></div>

      <h2 style={sectionTitle}>Vehicle</h2><div style={grid3}><Field label="Year" value={order.vehicle_year} onChange={(value) => change("vehicle_year", value)} /><Field label="Make" value={order.vehicle_make} onChange={(value) => change("vehicle_make", value)} /><Field label="Model" value={order.vehicle_model} onChange={(value) => change("vehicle_model", value)} /></div>
      <div style={grid2}><Field label="Color" value={order.vehicle_color || ""} onChange={(value) => change("vehicle_color", value)} /><Field label="License Plate" value={order.license_plate || ""} onChange={(value) => change("license_plate", value)} /></div>
      <h2 style={sectionTitle}>References</h2><div style={grid2}><Field label="Job / PO Number" value={order.job_number || ""} onChange={(value) => change("job_number", value)} /><Field label="MO Number" value={order.mo_number || ""} onChange={(value) => change("mo_number", value)} /></div>
      <h2 style={sectionTitle}>Tires</h2><div style={grid2}><Field label="Tire Position" value={order.tire_position || ""} onChange={(value) => change("tire_position", value)} /><Field label="Quantity" type="number" value={String(order.qty)} onChange={(value) => change("qty", Number(value))} /><Field label="Tire Size" value={order.tire_size} onChange={(value) => change("tire_size", value)} /><Field label="Product Number" value={order.tire_product_number || ""} onChange={(value) => change("tire_product_number", value)} /></div>
      <label style={label}>Notes<textarea value={order.notes || ""} onChange={(event) => change("notes", event.target.value)} style={textarea} /></label>
      <div style={actions}><button type="submit" disabled={working || order.job?.complete} style={saveButton}>{working ? "Saving..." : "Save Changes"}</button><button type="button" onClick={requestCancellation} disabled={working || order.job?.complete || order.order_status === "cancellation_requested"} style={cancelButton}>{order.order_status === "cancellation_requested" ? "Cancellation Requested" : "Request Cancellation"}</button></div>
    </form>}
  </div></main></KingdomPortalGate>;
}

function Field({ label: text, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label style={label}>{text}<input type={type} min={type === "number" ? 1 : undefined} value={value} onChange={(event) => onChange(event.target.value)} style={input} /></label>; }
const shell:React.CSSProperties={minHeight:"100vh",background:"#f8fafc",color:"#111827"};const page:React.CSSProperties={maxWidth:820,margin:"0 auto",padding:"24px 16px 50px"};
const back:React.CSSProperties={display:"inline-flex",marginBottom:14,color:"#1d4ed8",fontWeight:800,textDecoration:"none"};const card:React.CSSProperties={padding:22,border:"1px solid #e2e8f0",borderRadius:18,background:"white",boxShadow:"0 3px 12px rgba(15,23,42,.06)"};
const eyebrow:React.CSSProperties={fontSize:12,fontWeight:800,textTransform:"uppercase",color:"#2563eb"};const title:React.CSSProperties={fontSize:28,margin:"7px 0 16px"};const sectionTitle:React.CSSProperties={fontSize:17,margin:"24px 0 4px",paddingTop:16,borderTop:"1px solid #e5e7eb"};
const grid2:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12};const grid3:React.CSSProperties={...grid2,gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))"};const label:React.CSSProperties={display:"grid",gap:6,marginTop:12,fontSize:13,fontWeight:750,color:"#374151"};const input:React.CSSProperties={width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #cbd5e1",borderRadius:9,fontSize:16};const textarea:React.CSSProperties={...input,minHeight:110,resize:"vertical"};
const checkRow:React.CSSProperties={display:"flex",gap:9,alignItems:"center",padding:14,borderRadius:10,background:"#f8fafc",fontWeight:800};const choices:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:10};const choice:React.CSSProperties={display:"flex",gap:9,padding:14,border:"1px solid #cbd5e1",borderRadius:10,fontWeight:750};
const actions:React.CSSProperties={display:"flex",gap:10,flexWrap:"wrap",marginTop:24};const saveButton:React.CSSProperties={padding:"12px 16px",border:0,borderRadius:10,background:"#2563eb",color:"white",fontWeight:800};const cancelButton:React.CSSProperties={...saveButton,background:"#fff",color:"#b91c1c",border:"1px solid #fecaca"};
const notice:React.CSSProperties={padding:12,marginBottom:12,borderRadius:9,background:"#eff6ff",color:"#1d4ed8",fontWeight:700};const completeBanner:React.CSSProperties={...notice,background:"#f1f5f9",color:"#475569"};const cancelBanner:React.CSSProperties={...notice,background:"#fff7ed",color:"#9a3412"};const errorCard:React.CSSProperties={...card,color:"#991b1b"};
