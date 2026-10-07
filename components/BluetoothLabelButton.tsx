"use client";
import { useEffect, useState } from "react";
import type { TireLabelJob } from "./TireLabelPrint";

export default function BluetoothLabelButton({ job, disabled, style }: {job:TireLabelJob;disabled?:boolean;style?:React.CSSProperties}) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [gap,setGap]=useState("3");
  const [scale,setScale]=useState(80);
  const [prepared,setPrepared]=useState<{url:string;bytes:Uint8Array;filename:string;count:number;makeUrl:(bytes:Uint8Array,filename:string,gap:number)=>string}|null>(null);
  useEffect(()=>()=>{if(prepared) URL.revokeObjectURL(prepared.url);},[prepared]);
  async function prepare(printScale = scale) {
    setOpen(true);setBusy(true);setError("");setPrepared(null);
    try {
      const {tireLabelPdf,smoothPrintUrl,labelCount}=await import("@/lib/tire-label-pdf");
      const bytes=await tireLabelPdf(job,printScale);
      const filename=`bolt-labels-${crypto.randomUUID()}.pdf`;
      setPrepared({bytes,filename,count:labelCount(job.quantity),url:URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/pdf"})),makeUrl:smoothPrintUrl});
    } catch(e){setError(e instanceof Error?e.message:"Labels could not be prepared.");}
    finally{setBusy(false);}
  }
  const validGap=gap.trim()!=="" && Number.isFinite(Number(gap)) && Number(gap)>=0 && Number(gap)<=10;
  const href=prepared && validGap?prepared.makeUrl(prepared.bytes,prepared.filename,Number(gap)):undefined;
  return <>
    <button type="button" onClick={()=>prepare()} disabled={disabled || busy} style={style}>Print via Bluetooth</button>
    {open && <div style={{position:"fixed",inset:0,zIndex:10000,background:"#0f172a99",display:"grid",placeItems:"center",padding:16}} onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}}>
      <section role="dialog" aria-modal="true" aria-label="Print labels with Brother Smooth Print" style={{background:"white",color:"#111827",borderRadius:18,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxSizing:"border-box"}}>
        <h2 style={{marginTop:0}}>Print via Bluetooth</h2>
        <p>Uses <strong>Brother Smooth Print</strong> on your iPhone. Turn the printer on and select <strong>Connect via Bluetooth</strong> in Smooth Print first.</p>
        {busy && <p role="status">Preparing 4 × 6 labels…</p>}
        {error && <p role="alert">{error}</p>}
        {prepared && <>
          <p><strong>{prepared.count} label{prepared.count===1?"":"s"} · 4 × 6 inches</strong><br/>One numbered label per tire. Content is scaled to {scale}%; the page remains 4 × 6.</p>
          <label>Print size<select value={scale} onChange={e=>{const next=Number(e.target.value);setScale(next);void prepare(next);}} style={{display:"block",padding:10,marginBottom:12}}>{[75,80,90,100].map(value=><option key={value} value={value}>{value}%{value===80?" (recommended starting size)":""}</option>)}</select></label>
          <details><summary>Label roll settings</summary><p>For die-cut labels with a gap. Match the gap between your labels if the printer skips labels.</p><label>Gap between labels (mm)<input type="number" min="0" max="10" step="0.1" value={gap} onChange={e=>setGap(e.target.value)} style={{display:"block",width:"100%",padding:10,boxSizing:"border-box"}} /></label>{!validGap && <p role="alert">Enter a gap from 0 to 10 mm.</p>}</details>
          <p><a href={prepared.url} download={prepared.filename}>Download label PDF</a></p>
          {href && <a href={href} style={{display:"block",textAlign:"center",background:"#2563eb",color:"white",padding:14,borderRadius:10,textDecoration:"none",fontWeight:800}}>Open Smooth Print &amp; print</a>}
          <p style={{fontSize:13,color:"#475569"}}>Allow your iPhone to open Smooth Print when prompted. Confirm success or any printer error there. Returning here does not mean the labels printed. If nothing opens, check that Smooth Print is installed.</p>
        </>}
        <button type="button" onClick={()=>{setOpen(false);setPrepared(null);}} style={{padding:"10px 16px",marginTop:8}}>Close</button>
      </section>
    </div>}
  </>;
}
