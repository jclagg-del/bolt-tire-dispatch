"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { emptyJha, jhaValidation, JHA_MAX_PHOTO_BYTES, type JhaAssessment, type JhaStatus } from "@/lib/job-jha";
import { jhaRequest, prepareJhaPhoto } from "@/lib/job-jha-client";
import styles from "./JobJhaButton.module.css";

type Snapshot = {
  job: { customer?: string; po_number?: string; service_type?: string };
  record: { revision: number; status: JhaStatus; assessment: JhaAssessment; updated_at: string } | null;
  context: Record<string, unknown>; ready: boolean; readOnly: boolean;
  history: { revision: number; status: string; updated_at: string }[];
};

export default function JobJhaButton({ jobId }: { jobId: string | number }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [assessment, setAssessment] = useState<JhaAssessment>(emptyJha);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const uploadLock = useRef(false);
  const load = useCallback(async (version = "") => {
    const result: Snapshot = await jhaRequest(jobId, version ? `?revision=${version}` : "");
    const value = result.record?.assessment || emptyJha();
    const stale = !result.readOnly && !result.ready && result.record?.status === "complete";
    setData(result); setAssessment(stale ? { ...value, acknowledged: false, glasses: false, hearing: false, steps: value.steps.map(s => ({ ...s, controlled: false })) } : value); setDirty(false); setRevision(version);
    return result;
  }, [jobId]);
  useEffect(() => { if (open) return; let active = true; jhaRequest(jobId).then(result => { if (active) setData(result); }).catch(() => { if (active) setError("JHA unavailable — open to retry."); }); return () => { active = false; }; }, [jobId, open]);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  const locked = !!data?.readOnly || !!data?.ready;
  const change = (patch: Partial<JhaAssessment>) => { setAssessment(value => ({ ...value, acknowledged: false, ...patch })); setDirty(true); setMessage(""); };
  const close = () => { if (busy || (dirty && !window.confirm("Discard unsaved JHA changes? Uploaded photos are not attached until you save."))) return; setOpen(false); };
  const show = async () => {
    setOpen(true); setBusy(true); setError(""); setMessage(""); setStep(0); setData(null);
    try { await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load JHA."); } finally { setBusy(false); }
  };
  const save = async (status: JhaStatus, value = assessment) => {
    if (!data || busy) return;
    const validation = jhaValidation(value, status);
    if (validation) { setError(validation); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await jhaRequest(jobId, "", { method: "PUT", body: JSON.stringify({ revision: data.record?.revision || 0, context: data.context, status, assessment: value }) });
      setDirty(false);
      await load();
      setMessage(status === "complete" ? "JHA complete. You can now complete the job or task." : status === "unsafe" ? "Work hold saved. Job completion is blocked." : "Draft saved. Complete the JHA before completing this work.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save JHA."); } finally { setBusy(false); }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length || uploadLock.current || locked || busy) return;
    if (assessment.photos.length + files.length > 12) { setError("You can attach up to 12 photos."); return; }
    uploadLock.current = true; setBusy(true); setError("");
    try {
      for (const file of Array.from(files)) {
        const blob = await prepareJhaPhoto(file);
        if (blob.size > JHA_MAX_PHOTO_BYTES) throw new Error("This photo is too large. Choose a smaller photo.");
        const form = new FormData(); form.append("photo", blob, "photo.jpg");
        const result = await jhaRequest(jobId, "/photos", { method: "POST", body: form });
        setAssessment(value => ({ ...value, acknowledged: false, photos: [...value.photos, result.photo] })); setDirty(true);
      }
      setMessage("Photos uploaded. Save the JHA to attach them to this assessment.");
    } catch (e) { setError(e instanceof Error ? e.message : "Photo upload failed."); } finally { uploadLock.current = false; setBusy(false); }
  };
  const label = data?.ready ? "✓ JHA complete" : data?.readOnly ? "View JHA" : data?.record?.status === "unsafe" ? "JHA — work on hold" : error && !data ? "JHA — retry" : "Complete JHA";
  return <span onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <button type="button" className={styles.launch} onClick={show}>{label}</button>
    {open && createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby={`jha-title-${jobId}`} onCancel={event => { event.preventDefault(); close(); }} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <header className={styles.header}><div><small>JOB HAZARD ANALYSIS</small><h2 id={`jha-title-${jobId}`}>Safety check</h2><p>{data?.job.customer || "Job / task"} · {data?.job.po_number || `#${jobId}`} · {data?.job.service_type || "Service"}</p></div><button type="button" aria-label="Close JHA" disabled={busy} onClick={close}>×</button></header>
      <div className={styles.body}>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {message && <p role="status" className={styles.success}>{message}</p>}
        {!data ? <p>{busy ? "Loading assessment…" : "Unable to load. Close and reopen to retry."}</p> : <>
          <p className={styles.notice}>{data.record?.status === "unsafe" ? "WORK ON HOLD — resolve the hazards and reassess before completing." : data.ready ? "Completed JHA saved for the current job details." : data.readOnly ? "Saved assessment — read only." : "Required before completing this job or task. Assess actual site conditions and controls; do not proceed with unresolved hazards."}</p>
          {data.record?.status === "complete" && !data.ready && !data.readOnly && <p className={styles.error}>Job details changed. Reassess the work and confirm the assessment again.</p>}
          {data.history.length > 0 && <label className={styles.field}>Assessment history<select value={revision} disabled={busy} onChange={async event => { if (dirty && !window.confirm("Discard unsaved changes and view this revision?")) return; setBusy(true); setError(""); try { await load(event.target.value); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}><option value="">Current assessment</option>{data.history.map(item => <option key={item.revision} value={item.revision}>Revision {item.revision} · {item.status} · {new Date(item.updated_at).toLocaleString()}</option>)}</select></label>}
          {data.ready && !data.readOnly && <button type="button" disabled={busy} onClick={() => save("draft", { ...assessment, acknowledged: false, glasses: false, hearing: false, steps: assessment.steps.map(s => ({ ...s, controlled: false })) })}>Reassess — reopen JHA</button>}
          <nav className={styles.tabs} aria-label="JHA steps">{["1. Assessment", "2. Photos", "3. Review"].map((title, index) => <button type="button" key={title} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}>{title}</button>)}</nav>
          <fieldset disabled={busy || locked} className={styles.fields}>
            {step === 0 && <>
              <label className={styles.field}>Technician name *<input value={assessment.technician} maxLength={120} onChange={e => change({ technician: e.target.value })} /></label>
              <h3>Job steps, hazards and controls</h3><p>Include the work you will do, what could cause harm, and how you will control it.</p>
              {assessment.steps.map((item, index) => <section className={styles.card} key={index}>
                <strong>Step {index + 1}</strong>
                {(["task", "hazards", "controls"] as const).map(key => <label className={styles.field} key={key}>{key === "task" ? "Task / work step *" : key === "hazards" ? "Hazards identified *" : "Controls to use *"}<textarea rows={2} maxLength={key === "task" ? 500 : 3000} value={item[key]} onChange={e => change({ steps: assessment.steps.map((s, i) => i === index ? { ...s, [key]: e.target.value } : s) })} /></label>)}
                <label className={styles.check}><input type="checkbox" checked={item.controlled} onChange={e => change({ steps: assessment.steps.map((s, i) => i === index ? { ...s, controlled: e.target.checked } : s) })} />Controls are in place for this step</label>
                {assessment.steps.length > 1 && <button type="button" onClick={() => change({ steps: assessment.steps.filter((_, i) => i !== index) })}>Remove step</button>}
              </section>)}
              {assessment.steps.length < 20 && <button type="button" onClick={() => change({ steps: [...assessment.steps, { task: "", hazards: "", controls: "", controlled: false }] })}>+ Add work step</button>}
              <h3>Standard PPE</h3>
              <label className={styles.check}><input type="checkbox" checked={assessment.glasses} onChange={e => change({ glasses: e.target.checked })} />Safety glasses — required</label>
              <label className={styles.check}><input type="checkbox" checked={assessment.hearing} onChange={e => change({ hearing: e.target.checked })} />Hearing protection — required</label>
              <label className={styles.check}><input type="checkbox" checked={assessment.gloves} onChange={e => change({ gloves: e.target.checked })} />Gloves — optional unless required by the task or site</label>
              <label className={styles.field}>Additional task / site PPE<textarea value={assessment.additionalPpe} maxLength={3000} onChange={e => change({ additionalPpe: e.target.value })} /></label>
            </>}
            {step === 1 && <>
              <h3>Job photos <small>(optional)</small></h3><p>Attach site conditions, hazards, controls or completed work. Photos stay with the saved assessment and are staff-only.</p>
              {!locked && <div className={styles.photoActions}><label>Take photo<input type="file" accept="image/*" capture="environment" onChange={e => { upload(e.target.files); e.target.value = ""; }} /></label><label>Choose photos<input type="file" accept="image/*" multiple onChange={e => { upload(e.target.files); e.target.value = ""; }} /></label></div>}
              <p>{assessment.photos.length} of 12 photos</p>
              {assessment.photos.map((photo, index) => <section className={styles.card} key={photo.path}>
                {photo.url ? <a href={photo.url} target="_blank" rel="noreferrer"><img className={styles.photo} src={photo.url} alt={photo.caption || `JHA photo ${index + 1}`} /></a> : <p>Preview unavailable. Reopen the JHA to refresh it.</p>}
                <label className={styles.field}>Photo type<select value={photo.category} onChange={e => change({ photos: assessment.photos.map((p, i) => i === index ? { ...p, category: e.target.value as typeof p.category } : p) })}>{["Before work", "Hazard / control", "After work"].map(v => <option key={v}>{v}</option>)}</select></label>
                <label className={styles.field}>Caption<input maxLength={500} value={photo.caption} onChange={e => change({ photos: assessment.photos.map((p, i) => i === index ? { ...p, caption: e.target.value } : p) })} /></label>
                {!locked && <button type="button" onClick={() => change({ photos: assessment.photos.filter((_, i) => i !== index) })}>Remove from this assessment</button>}
              </section>)}
            </>}
            {step === 2 && <>
              <h3>Review before signing</h3><p>{assessment.steps.length} work steps · {assessment.photos.length} photos · Technician: {assessment.technician || "Not entered"}</p>
              {assessment.steps.map((s, i) => <section key={i} className={styles.card}><strong>{i + 1}. {s.task || "Task missing"}</strong><p>Hazards: {s.hazards || "Not entered"}</p><p>Controls: {s.controls || "Not entered"}</p><p>{s.controlled ? "✓ Controls confirmed" : "Controls not confirmed"}</p></section>)}
              <p>Safety glasses: {assessment.glasses ? "Confirmed" : "Not confirmed"} · Hearing protection: {assessment.hearing ? "Confirmed" : "Not confirmed"} · Gloves: {assessment.gloves ? "Selected" : "Not selected (optional)"}</p>
              <label className={styles.field}>Additional notes<textarea maxLength={3000} value={assessment.notes} onChange={e => change({ notes: e.target.value })} /></label>
              <label className={styles.field}>Unresolved hazard / work hold reason<textarea maxLength={3000} value={assessment.unsafeReason} onChange={e => change({ unsafeReason: e.target.value })} placeholder="If unsafe, describe the issue and select Save work hold. Clear only after resolving and reassessing." /></label>
              <label className={styles.check}><input type="checkbox" checked={assessment.acknowledged} onChange={e => change({ acknowledged: e.target.checked })} />I have assessed this job, confirmed the controls and required PPE, and have no unresolved hazards.</label>
            </>}
          </fieldset>
          {data.record && <p className={styles.meta}>Saved revision {data.record.revision} · {new Date(data.record.updated_at).toLocaleString()}</p>}
        </>}
      </div>
      <footer className={styles.footer}>
        <button type="button" disabled={busy} onClick={close}>Close</button>
        {data && !locked && <button type="button" disabled={busy} onClick={() => save("draft")}>Save draft</button>}
        {data && step < 2 && <button type="button" className={styles.primary} disabled={busy} onClick={() => setStep(step + 1)}>Next</button>}
        {data && step === 2 && !locked && <><button type="button" className={styles.danger} disabled={busy} onClick={() => save("unsafe")}>Save work hold</button><button type="button" className={styles.primary} disabled={busy} onClick={() => save("complete")}>{busy ? "Saving…" : "Complete JHA"}</button></>}
      </footer>
    </dialog>, document.body)}
  </span>;
}
