"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import { QuoteOption, QuoteStatus, quoteOptionTotal } from "@/lib/quotes";

type SavedQuote = {
  id: string; quote_number: number; status: QuoteStatus; customer: string; contact_name: string | null;
  phone: string | null; email: string | null; vehicle: string | null; tire_size: string | null; quantity: number;
  address: string | null; notes: string | null; service_category: string; installation_cost: number;
  service_call_fee: number; disposal_fee: number; ny_state_tire_fee: number; sales_tax_rate: number;
  tax_exempt: boolean; selected_option_id: string | null; expires_at: string | null; converted_job_id: string | null;
  public_token: string; payment_status: "unpaid" | "pending" | "paid" | "refunded"; amount_paid: number | null;
  quote_options: Array<Omit<QuoteOption, "price_per_tire" | "warranty_miles"> & { id: string; price_per_tire: number; warranty_miles: number | null }>;
};

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [quote, setQuote] = useState<SavedQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadQuote = async () => {
    if (!id) return;
    const { data, error } = await supabase.from("quotes").select("*,quote_options!quote_options_quote_id_fkey(*)").eq("id", id).single();
    setLoading(false);
    if (error) { setMessage(error.message); return; }
    const next = data as SavedQuote;
    next.quote_options = [...(next.quote_options || [])].sort((a, b) => a.sort_order - b.sort_order);
    setQuote(next);
  };

  useEffect(() => { loadQuote(); }, [id]);

  const totals = useMemo(() => quote ? quote.quote_options.map((option) => quoteOptionTotal(
    { price_per_tire: String(option.price_per_tire) }, quote.quantity,
    { installation: Number(quote.installation_cost), serviceCall: Number(quote.service_call_fee), disposal: Number(quote.disposal_fee), stateFee: Number(quote.ny_state_tire_fee), taxRate: Number(quote.sales_tax_rate), taxExempt: quote.tax_exempt }
  )) : [], [quote]);

  const selectOption = async (optionId: string) => {
    if (!quote) return;
    setSaving(true);
    const { error } = await supabase.from("quotes").update({ selected_option_id: optionId, status: "approved", updated_at: new Date().toISOString() }).eq("id", quote.id);
    setSaving(false);
    if (error) return setMessage(error.message);
    setMessage("Tire option approved.");
    await loadQuote();
  };

  const updateStatus = async (status: QuoteStatus) => {
    if (!quote) return;
    setSaving(true);
    const { error } = await supabase.from("quotes").update({ status, updated_at: new Date().toISOString() }).eq("id", quote.id);
    setSaving(false);
    if (error) return setMessage(error.message);
    await loadQuote();
  };

  const copyCustomerLink = async () => {
    if (!quote?.public_token) return setMessage("Save the quote before sharing it.");
    const link = `${window.location.origin}/q/${quote.public_token}`;
    try {
      await navigator.clipboard.writeText(link);
      if (quote.status === "draft") {
        await supabase.from("quotes").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", quote.id);
        setQuote({ ...quote, status: "sent" });
      }
      setMessage("Customer quote link copied. Paste it into a text or email.");
    } catch {
      window.prompt("Copy this customer quote link:", link);
    }
  };

  const convertToJob = async () => {
    if (!quote || quote.converted_job_id) return;
    const selected = quote.quote_options.find((option) => option.id === quote.selected_option_id);
    if (!selected) return alert("Approve one tire option before converting this quote.");
    setSaving(true);
    const tireSubtotal = Number(selected.price_per_tire) * quote.quantity;
    const taxableSubtotal = tireSubtotal + Number(quote.installation_cost) + Number(quote.service_call_fee) + Number(quote.disposal_fee);
    const salesTax = quote.tax_exempt ? 0 : taxableSubtotal * (Number(quote.sales_tax_rate) / 100);
    const total = taxableSubtotal + Number(quote.ny_state_tire_fee) + salesTax;
    const combinedNotes = [quote.notes, `Converted from quote #${quote.quote_number}`, quote.service_call_fee > 0 ? `Service call: $${Number(quote.service_call_fee).toFixed(2)}` : null].filter(Boolean).join("\n");
    const { data: job, error } = await supabase.from("jobs").insert({
      customer: quote.customer, contact_name: quote.contact_name, phone: quote.phone, email: quote.email,
      vehicle: quote.vehicle, tires: `${selected.brand} ${selected.model}`, size: quote.tire_size,
      qty: quote.quantity, price_tires: Number(selected.price_per_tire), installation_cost: Number(quote.installation_cost) + Number(quote.service_call_fee),
      tire_disposal_fee: Number(quote.disposal_fee), ny_state_tire_fee: Number(quote.ny_state_tire_fee),
      address: quote.address, notes: combinedNotes || null, subtotal: taxableSubtotal + Number(quote.ny_state_tire_fee),
      sales_tax_rate: quote.tax_exempt ? 0 : Number(quote.sales_tax_rate), sales_tax_amount: salesTax,
      tax_exempt: quote.tax_exempt, job_total: total, payment_status: "unpaid", job_status: "unscheduled",
      complete: false, vehicle_id: "stepvan",
    }).select("id").single();
    if (error || !job) { setSaving(false); return alert(`Could not create job: ${error?.message || "Unknown error"}`); }
    const { error: quoteError } = await supabase.from("quotes").update({ status: "converted", converted_job_id: job.id, updated_at: new Date().toISOString() }).eq("id", quote.id);
    setSaving(false);
    if (quoteError) return setMessage(`Job created, but quote status failed: ${quoteError.message}`);
    router.push(`/jobs/${job.id}`);
  };

  if (loading) return <div className="quote-shell"><AppHeader /><main className="quote-page"><div className="quote-empty">Loading quote...</div></main></div>;
  if (!quote) return <div className="quote-shell"><AppHeader /><main className="quote-page"><div className="quote-error">{message || "Quote not found."}</div></main></div>;

  return <div className="quote-shell"><AppHeader /><main className="quote-page">
    <div className="quote-page-header"><div><div className="quote-eyebrow">Quote #{quote.quote_number}</div><h1>{quote.customer}</h1><p>{[quote.vehicle, quote.tire_size, `${quote.quantity} tires`].filter(Boolean).join(" • ")}</p></div><div className="quote-actions">
      <select value={quote.status} onChange={(event) => updateStatus(event.target.value as QuoteStatus)} disabled={saving || quote.status === "converted"}><option value="draft">Draft</option><option value="sent">Sent</option><option value="viewed">Viewed</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="expired">Expired</option><option value="converted">Converted</option></select>
      <button onClick={copyCustomerLink} disabled={saving}>Copy Customer Link</button>
      <button className="quote-primary" onClick={convertToJob} disabled={saving || Boolean(quote.converted_job_id)}>{quote.converted_job_id ? "Converted to Job" : "Convert to Job"}</button>
    </div></div>
    {quote.payment_status === "paid" ? <div className="quote-paid-banner"><strong>Paid${quote.amount_paid != null ? ` — $${Number(quote.amount_paid).toFixed(2)}` : ""}</strong><span>Stripe payment received. This quote is ready to schedule or convert to a job.</span></div> : quote.payment_status === "pending" ? <div className="quote-message">Customer checkout has started; payment has not been confirmed yet.</div> : null}
    {message ? <div className="quote-message">{message}</div> : null}

    <section className="quote-customer-summary"><div><strong>{quote.contact_name || "Customer contact"}</strong><span>{quote.phone || "No phone"}</span><span>{quote.email || "No email"}</span></div><div><strong>Service</strong><span>{quote.service_category}</span><span>{quote.address || "No service address"}</span></div><div><strong>Quote expires</strong><span>{quote.expires_at ? new Date(`${quote.expires_at}T12:00:00`).toLocaleDateString() : "No expiration"}</span></div></section>

    <section className="quote-comparison-grid">
      {quote.quote_options.map((option, index) => {
        const selected = quote.selected_option_id === option.id;
        return <article className={`quote-compare-card ${option.recommended ? "recommended" : ""} ${selected ? "selected" : ""}`} key={option.id}>
          <div className="quote-tier-row"><span className={`quote-tier ${option.tier}`}>{option.tier}</span>{option.recommended ? <span className="quote-recommended">Bolt recommends</span> : null}</div>
          {option.image_url ? <img className="quote-tire-image" src={option.image_url} alt={`${option.brand} ${option.model}`} /> : <div className="quote-image-placeholder">No tire image</div>}
          <h2>{option.brand}</h2><h3>{option.model}</h3>
          <div className="quote-price-each">${Number(option.price_per_tire).toFixed(2)} <span>per tire</span></div>
          <dl className="quote-specs"><div><dt>Warranty</dt><dd>{option.warranty_miles ? `${Number(option.warranty_miles).toLocaleString()} miles` : "—"}</dd></div><div><dt>Type</dt><dd>{option.tire_type || "—"}</dd></div><div><dt>Load / speed</dt><dd>{option.load_speed_rating || "—"}</dd></div><div><dt>Snow rating</dt><dd>{option.snow_rating || "—"}</dd></div><div><dt>Availability</dt><dd>{option.availability || "Confirm availability"}</dd></div></dl>
          {option.highlights ? <p className="quote-highlights">{option.highlights}</p> : null}
          <div className="quote-installed-total"><span>Installed total</span><strong>${totals[index].toFixed(2)}</strong></div>
          <button className={selected ? "quote-selected-button" : "quote-select-button"} onClick={() => selectOption(option.id)} disabled={saving || quote.status === "converted"}>{selected ? "✓ Approved choice" : "Choose this tire"}</button>
        </article>;
      })}
    </section>

    <section className="quote-form-card"><h2>Included pricing</h2><div className="quote-fee-summary"><span>Installation <strong>${Number(quote.installation_cost).toFixed(2)}</strong></span><span>Service call <strong>${Number(quote.service_call_fee).toFixed(2)}</strong></span><span>Disposal <strong>${Number(quote.disposal_fee).toFixed(2)}</strong></span><span>NY state fee <strong>${Number(quote.ny_state_tire_fee).toFixed(2)}</strong></span><span>Sales tax <strong>{quote.tax_exempt ? "Exempt" : `${Number(quote.sales_tax_rate)}%`}</strong></span></div>{quote.notes ? <p className="quote-notes">{quote.notes}</p> : null}</section>
  </main></div>;
}
