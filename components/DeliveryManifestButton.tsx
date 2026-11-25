"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { createDeliveryManifest, dailyDeliveryGroups, deliveryQuantity, fleetDeliveryOrganization, type DeliveryJob } from "@/lib/delivery-manifest";
import { routeDayLabel } from "@/lib/route-order";

type Source = { date: string; jobs: DeliveryJob[] };
type Prepared = { key: string; url: string; href: string; pages: number };
export default function DeliveryManifestButton({ date, initialGroupKey, disabled = false }: { date: string; initialGroupKey?: string; disabled?: boolean }) {
  const [open,setOpen] = useState(false);
  const [source,setSource] = useState<Source | null>(null);
  const [loading,setLoading] = useState(false);
  const [loadError,setLoadError] = useState("");
  const [retry,setRetry] = useState(0);
  const [groupKey,setGroupKey] = useState("");
  const [selected,setSelected] = useState<string[]>([]);
  const [receivingSite,setReceivingSite] = useState("");
  const [scale,setScale] = useState(100);
  const [gap,setGap] = useState("3");
  const [prepared,setPrepared] = useState<Prepared | null>(null);
  const [failure,setFailure] = useState<{key:string;message:string} | null>(null);
  const [launchError,setLaunchError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const siteListId = useId();
  const jobs = source?.date === date && !loading && !loadError ? source.jobs : [];
  const groups = useMemo(() => dailyDeliveryGroups(jobs,date), [jobs,date]);
  const group = groups.find(item => item.key === groupKey);
  const organizationJobs = jobs.filter(job => fleetDeliveryOrganization(job) === group?.organization);
  const selectedJobs = organizationJobs.filter(job => selected.includes(String(job.id)));
  let manifest = null, selectionError = "";
  if (group) {
    try { manifest = createDeliveryManifest(date,group.organization,receivingSite,selectedJobs); }
    catch (error) { selectionError = error instanceof Error ? error.message : "Check the selected deliveries."; }
  }
  const key = open && manifest ? JSON.stringify({manifest,scale,gap}) : "";
  const ready = key && prepared?.key === key ? prepared : null;
  const pdfError = key && failure?.key === key ? failure.message : "";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    setSource(null); setLoading(true); setLoadError(""); setPrepared(null); setLaunchError("");
    async function load() {
      try {
        const {data} = await supabase.auth.getSession();
        const response = await fetch(`/api/delivery-manifest?date=${encodeURIComponent(date)}`, {
          cache:"no-store", signal:controller.signal, headers:{Authorization:`Bearer ${data.session?.access_token || ""}`},
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load deliveries.");
        if (result.date !== date || !Array.isArray(result.jobs)) throw new Error("The delivery date did not match. Reload before printing.");
        if (cancelled) return;
        const available = dailyDeliveryGroups(result.jobs as DeliveryJob[],date);
        const first = available.find(item => item.key === initialGroupKey) || available[0];
        setSource(result); setGroupKey(first?.key || "");
        setSelected(first?.jobs.map(job => String(job.id)) || []);
        setReceivingSite(first?.site === "Facility not set" ? "" : first?.site || "");
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load deliveries.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  },[open,date,initialGroupKey,retry]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false, objectUrl: string | undefined;
    setFailure(null); setLaunchError("");
    async function prepare() {
      try {
        const snapshot = JSON.parse(key);
        const gapMm = Number(snapshot.gap);
        if (!snapshot.gap.trim() || !Number.isFinite(gapMm) || gapMm < 0 || gapMm > 10) throw new Error("Enter a label gap from 0 to 10 mm.");
        const [{deliveryManifestPdf},{smoothPrintUrl},logoResponse] = await Promise.all([
          import("@/lib/delivery-manifest-pdf"),import("@/lib/tire-label-pdf"),fetch("/bolt-logo.png"),
        ]);
        const logo = logoResponse.ok ? new Uint8Array(await logoResponse.arrayBuffer()) : undefined;
        const result = await deliveryManifestPdf(snapshot.manifest,snapshot.scale,logo);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)],{type:"application/pdf"}));
        setPrepared({key,url:objectUrl,href:smoothPrintUrl(result.bytes,`bolt-labels-bol-${crypto.randomUUID()}.pdf`,gapMm),pages:result.pages});
      } catch (error) { if (!cancelled) setFailure({key,message:error instanceof Error ? error.message : "The document could not be prepared."}); }
    }
    void prepare();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[key]);

  function close() { setOpen(false); trigger.current?.focus(); }
  function changeGroup(value: string) {
    const next = groups.find(item => item.key === value);
    setGroupKey(value); setSelected(next?.jobs.map(job => String(job.id)) || []);
    setReceivingSite(next?.site === "Facility not set" ? "" : next?.site || "");
  }
  return <>
    <button ref={trigger} type="button" disabled={disabled} onClick={event => { event.stopPropagation(); setOpen(true); }} style={action}>Print bill of lading</button>
    {open && createPortal(<div style={overlay} onClick={event => event.stopPropagation()} onKeyDown={event => {if(event.key === "Escape") close();}}>
      <section role="dialog" aria-modal="true" aria-label="Daily bill of lading" style={dialog}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12}}><h2 style={{margin:0}}>Daily bill of lading</h2><button autoFocus type="button" onClick={close} aria-label="Close bill of lading">Close</button></div>
        <p>{routeDayLabel(date)} · 4 × 6 portrait</p>
        <p>One document per organization and actual drop-off site. Scheduled and completed deliveries are included; cancelled jobs and pickups are not.</p>
        {loading && <p role="status">Loading the full day’s deliveries…</p>}
        {loadError && <p role="alert">{loadError}</p>}
        {!loading && !loadError && !groups.length && <p>No Kingdom or HPR deliveries are scheduled for this date.</p>}
        {!!groups.length && <>
          <label style={label}>Start with this group<select style={input} value={groupKey} onChange={event => changeGroup(event.target.value)}>{groups.map(item => <option key={item.key} value={item.key}>{item.organization} — {item.site} ({item.jobs.length} jobs){item.jobs[0]?.address ? ` — ${item.jobs[0].address}` : ""}</option>)}</select></label>
          <label style={label}>Actual drop-off / receiving site<input style={input} list={siteListId} maxLength={200} value={receivingSite} onChange={event => setReceivingSite(event.target.value)} placeholder="For example: Wallkill" /></label>
          <datalist id={siteListId}>{[...new Set(groups.filter(item => item.organization === group?.organization).map(item => item.site))].filter(site => site !== "Facility not set").map(site => <option key={site} value={site} />)}</datalist>
          <p>If Kingdom is shuttling tires onward, enter the receiving hub above and check those additional deliveries below. Their final facilities stay on the document. This does not change job destinations.</p>
          <fieldset style={{border:"1px solid #d6deea",borderRadius:12,padding:12}}><legend>Deliveries to include</legend>
            {organizationJobs.map(job => <label key={job.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:"1px solid #e5e7eb"}}>
              <input type="checkbox" checked={selected.includes(String(job.id))} onChange={event => setSelected(ids => event.target.checked ? [...new Set([...ids,String(job.id)])] : ids.filter(id => id !== String(job.id)))} />
              <span><strong>Job {job.po_number || job.id} · MO {job.mo_number || "Not provided"}</strong><br/>{deliveryQuantity(job) ?? "?"} tires · {job.tires || "Description missing"} · {job.size || "Size missing"}<br/>Final: {job.facility_name || "Facility not set"}{job.complete ? " · Job completed" : ""}</span>
            </label>)}
          </fieldset>
          <p><strong>{selectedJobs.length} jobs selected{manifest ? ` · ${manifest.total} tires expected` : ""}</strong></p>
          {selectionError && <p role="alert">{selectionError}</p>}
          {pdfError && <p role="alert">{pdfError}</p>}
          {key && !ready && !pdfError && <p role="status">Preparing the labels…</p>}
          {ready && <p>{ready.pages} numbered label{ready.pages === 1 ? "" : "s"} in this document · {scale}% print size</p>}
          <button type="button" style={action} disabled={!ready} onClick={() => {if(ready) {try {window.location.assign(ready.href);} catch {setLaunchError("Smooth Print could not open. Use the PDF below or check that Brother Smooth Print is installed.");}}}}>Print with Smooth Print</button>
          {ready && <p><a href={ready.url} target="_blank" rel="noopener noreferrer">Preview / download PDF</a></p>}
          {launchError && <p role="alert">{launchError}</p>}
          <p>Use the printer selected in Brother Smooth Print. Confirm printing there. Printing does not complete jobs or confirm delivery; check and sign the paper at handoff.</p>
          <details><summary>Print settings</summary><label style={label}>Content size<select style={input} value={scale} onChange={event => setScale(Number(event.target.value))}>{[75,80,90,100].map(value => <option key={value} value={value}>{value}%</option>)}</select></label><label style={label}>Label gap (mm)<input style={input} type="number" min="0" max="10" step="0.1" value={gap} onChange={event => setGap(event.target.value)} /></label></details>
        </>}
        <button type="button" disabled={loading} onClick={() => setRetry(value => value+1)} style={{marginTop:16,padding:10}}>Reload deliveries</button>
      </section>
    </div>,document.body)}
  </>;
}
const action: React.CSSProperties = {background:"#2563eb",color:"white",border:0,borderRadius:9,padding:"11px 14px",fontWeight:700,cursor:"pointer",fontSize:14};
const label: React.CSSProperties = {display:"block",fontWeight:700,marginBottom:14};
const input: React.CSSProperties = {display:"block",width:"100%",padding:10,border:"1px solid #cbd5e1",borderRadius:8,fontSize:16,boxSizing:"border-box",marginTop:6};
const overlay: React.CSSProperties = {position:"fixed",inset:0,zIndex:10000,background:"#0f172a99",display:"grid",placeItems:"center",padding:14};
const dialog: React.CSSProperties = {width:"100%",maxWidth:650,maxHeight:"90dvh",overflowY:"auto",background:"white",color:"#111827",borderRadius:18,padding:22,boxSizing:"border-box"};
