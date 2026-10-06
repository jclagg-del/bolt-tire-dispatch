"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { discountCodeError, discountLabel, normalizeDiscountCode, type DiscountCode } from "@/lib/discounts";

const blank = (): DiscountCode => ({ id: "", code: "", description: "", percent: 0, discount_type: "percent", fixed_amount: 0, organization: null, tax_exempt: false, exemption_reference: null, active: false, expires_on: null });
export default function DiscountCodeSettings() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [draft, setDraft] = useState<DiscountCode>(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function call(method = "GET", value?: DiscountCode) {
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/discount-codes", { method, headers: { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" }, ...(value ? { body: JSON.stringify(value) } : {}), cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Discount settings could not be loaded.");
    return result;
  }
  useEffect(() => { setBusy(true); call().then(result => setCodes(result.codes)).catch(error => setMessage(error.message)).finally(() => setBusy(false)); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const value = { ...draft, code: normalizeDiscountCode(draft.code) };
    const error = discountCodeError(value);
    if (error) { setMessage(error); return; }
    setBusy(true); setMessage("");
    try {
      const result = await call("POST", value);
      setCodes(current => [result.code, ...current.filter(item => item.id !== result.code.id)]);
      setDraft(blank()); setMessage("Discount code saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    finally { setBusy(false); }
  }
  return <div className="discount-settings">
    <section className="purchase-builder-card">
      <h2>Discount codes</h2>
      <p>Discounts reduce tire prices only. Approved organization exemptions remove sales tax on tires and services; state tire fees remain separate.</p>
      {message && <p role="status">{message}</p>}
      <form onSubmit={save}>
        <div className="purchase-builder-fields">
          <label>Discount code *<input required maxLength={40} value={draft.code} onChange={e => setDraft({ ...draft, code: normalizeDiscountCode(e.target.value) })} autoComplete="off" /></label>
          <label>Discount type<select value={draft.discount_type || "percent"} onChange={e => setDraft({ ...draft, discount_type: e.target.value as "percent" | "fixed" })}><option value="percent">Percentage (%)</option><option value="fixed">Fixed dollars per tire ($)</option></select></label>
          {draft.discount_type === "fixed"
            ? <label>Discount per tire ($) *<input required type="number" min="0" max="999999.99" step="0.01" value={draft.fixed_amount ?? 0} onChange={e => setDraft({ ...draft, fixed_amount: Number(e.target.value) })} /><small>Applied to each tire, up to its price. A $20 code saves $80 on four tires.</small></label>
            : <label>Tire discount (%) *<input required type="number" min="0" max="100" step="0.001" value={draft.percent} onChange={e => setDraft({ ...draft, percent: Number(e.target.value) })} /></label>}
          <label>Description<input maxLength={200} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
          <label>Expiration date<input type="date" value={draft.expires_on || ""} onChange={e => setDraft({ ...draft, expires_on: e.target.value || null })} /></label>
          <label>Organization<input list="discount-organizations" maxLength={150} value={draft.organization || ""} onChange={e => setDraft({ ...draft, organization: e.target.value || null })} placeholder="Leave blank for a personal discount" /><datalist id="discount-organizations"><option value="Kingdom Support Services"/><option value="HPR"/></datalist></label>
          <label>Approved exemption record reference<input required={draft.tax_exempt} maxLength={300} value={draft.exemption_reference || ""} onChange={e => setDraft({ ...draft, exemption_reference: e.target.value || null })} placeholder="Your certificate / exemption record reference" /></label>
        </div>
        <p><label><input type="checkbox" checked={draft.tax_exempt} onChange={e => setDraft({ ...draft, tax_exempt: e.target.checked })} /> Organization exemption approved for tires and services</label></p>
        <p><label><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Active</label></p>
        <button type="submit" disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Create discount code"}</button>{draft.id && <button type="button" disabled={busy} onClick={() => setDraft(blank())}>Cancel editing</button>}
      </form>
    </section>
    {codes.map(code => <section className="purchase-builder-card" key={code.id}>
      <h3>{code.code} · {discountLabel(code)}</h3>
      <p>{code.organization || "Personal / general discount"} · {code.active ? "Active" : "Inactive"}{code.expires_on ? ` · Expires ${code.expires_on}` : ""}</p>
      <p>{code.tax_exempt ? "Approved sales-tax exemption on tires and services" : "Normal sales tax"}</p>
      {code.description && <p>{code.description}</p>}
      <button type="button" disabled={busy} onClick={() => { setDraft(code); setMessage(""); }}>Edit {code.code}</button>
    </section>)}
  </div>;
}
