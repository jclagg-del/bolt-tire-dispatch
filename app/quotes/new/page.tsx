"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";
import { BusinessSettings, fallbackBusinessSettings, installationDefault } from "@/lib/business-settings";
import { emptyQuoteOptions, QuoteOption, quoteOptionTotal } from "@/lib/quotes";

type QuoteForm = {
  customer: string; contact_name: string; phone: string; email: string; vehicle: string;
  tire_size: string; quantity: string; address: string; notes: string;
  service_category: "passenger" | "truck" | "commercial";
  installation_cost: string; service_call_fee: string; disposal_fee: string;
  ny_state_tire_fee: string; sales_tax_rate: string; tax_exempt: boolean; expires_at: string;
};

const initialForm: QuoteForm = {
  customer: "", contact_name: "", phone: "", email: "", vehicle: "", tire_size: "", quantity: "4",
  address: "", notes: "", service_category: "passenger", installation_cost: "275", service_call_fee: "0",
  disposal_fee: "28", ny_state_tire_fee: "10", sales_tax_rate: "", tax_exempt: false, expires_at: "",
};

export default function NewQuotePage() {
  const router = useRouter();
  const [form, setForm] = useState<QuoteForm>(initialForm);
  const [options, setOptions] = useState<QuoteOption[]>(emptyQuoteOptions.map((option) => ({ ...option })));
  const [settings, setSettings] = useState<BusinessSettings>(fallbackBusinessSettings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from("business_settings").select("*").eq("id", true).maybeSingle();
      const next = (data as BusinessSettings | null) || fallbackBusinessSettings;
      setSettings(next);
      applyPricing(next, "passenger", 4);
    };
    loadSettings();
  }, []);

  const applyPricing = (pricing: BusinessSettings, category: QuoteForm["service_category"], quantity: number) => {
    const disposalEach = category === "passenger" ? pricing.passenger_disposal_fee : category === "truck" ? pricing.truck_disposal_fee : pricing.commercial_disposal_fee;
    const installation = category === "commercial" ? pricing.commercial_22_install * quantity : installationDefault(pricing, quantity, category);
    setForm((current) => ({
      ...current,
      service_category: category,
      installation_cost: installation.toFixed(2),
      service_call_fee: category === "commercial" ? pricing.commercial_service_call.toFixed(2) : "0.00",
      disposal_fee: (disposalEach * quantity).toFixed(2),
      ny_state_tire_fee: (pricing.ny_state_tire_fee * quantity).toFixed(2),
      sales_tax_rate: current.sales_tax_rate || String(pricing.default_sales_tax_rate || ""),
    }));
  };

  const updateOption = (index: number, key: keyof QuoteOption, value: string | boolean) => {
    setOptions((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const totals = useMemo(() => options.map((option) => quoteOptionTotal(option, Number(form.quantity) || 0, {
    installation: Number(form.installation_cost) || 0, serviceCall: Number(form.service_call_fee) || 0,
    disposal: Number(form.disposal_fee) || 0, stateFee: Number(form.ny_state_tire_fee) || 0,
    taxRate: Number(form.sales_tax_rate) || 0, taxExempt: form.tax_exempt,
  })), [options, form]);

  const saveQuote = async () => {
    if (!form.customer.trim()) return alert("Enter a customer name.");
    const completedOptions = options.filter((option) => option.brand.trim() && option.model.trim());
    if (!completedOptions.length) return alert("Add at least one tire option.");
    setSaving(true);
    const { data: quote, error } = await supabase.from("quotes").insert({
      customer: form.customer.trim(), contact_name: form.contact_name.trim() || null, phone: form.phone.trim() || null,
      email: form.email.trim() || null, vehicle: form.vehicle.trim() || null, tire_size: form.tire_size.trim() || null,
      quantity: Number(form.quantity) || 1, address: form.address.trim() || null, notes: form.notes.trim() || null,
      service_category: form.service_category, installation_cost: Number(form.installation_cost) || 0,
      service_call_fee: Number(form.service_call_fee) || 0, disposal_fee: Number(form.disposal_fee) || 0,
      ny_state_tire_fee: Number(form.ny_state_tire_fee) || 0, sales_tax_rate: Number(form.sales_tax_rate) || 0,
      tax_exempt: form.tax_exempt, expires_at: form.expires_at || null,
    }).select("id").single();
    if (error || !quote) { setSaving(false); return alert(`Could not save quote: ${error?.message || "Unknown error"}`); }
    const { error: optionError } = await supabase.from("quote_options").insert(completedOptions.map((option) => ({
      quote_id: quote.id, tier: option.tier, brand: option.brand.trim(), model: option.model.trim(),
      image_url: option.image_url.trim() || null, price_per_tire: Number(option.price_per_tire) || 0,
      warranty_miles: option.warranty_miles ? Number(option.warranty_miles) : null, tire_type: option.tire_type.trim() || null,
      load_speed_rating: option.load_speed_rating.trim() || null, snow_rating: option.snow_rating.trim() || null,
      highlights: option.highlights.trim() || null, availability: option.availability.trim() || null,
      recommended: option.recommended, sort_order: option.sort_order,
    })));
    setSaving(false);
    if (optionError) return alert(`Quote saved, but options failed: ${optionError.message}`);
    router.push(`/quotes/${quote.id}`);
  };

  return (
    <div className="quote-shell"><AppHeader /><main className="quote-page">
      <div className="quote-page-header"><div><div className="quote-eyebrow">Quotes</div><h1>Build Tire Quote</h1><p>Create a visual Good/Better/Best comparison.</p></div><button className="quote-primary" onClick={saveQuote} disabled={saving}>{saving ? "Saving..." : "Save Quote"}</button></div>

      <section className="quote-form-card"><h2>Customer and vehicle</h2><div className="quote-form-grid">
        <QuoteField label="Customer" value={form.customer} onChange={(value) => setForm({ ...form, customer: value })} />
        <QuoteField label="Contact name" value={form.contact_name} onChange={(value) => setForm({ ...form, contact_name: value })} />
        <QuoteField label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <QuoteField label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <QuoteField label="Vehicle" value={form.vehicle} onChange={(value) => setForm({ ...form, vehicle: value })} placeholder="Year, make, model or unit" />
        <QuoteField label="Tire size" value={form.tire_size} onChange={(value) => setForm({ ...form, tire_size: value })} placeholder="275/65R18" />
        <QuoteField label="Quantity" value={form.quantity} type="number" onChange={(value) => { const quantity = Number(value) || 0; setForm((current) => ({ ...current, quantity: value })); applyPricing(settings, form.service_category, quantity); }} />
        <label className="quote-field"><span>Pricing category</span><select value={form.service_category} onChange={(event) => applyPricing(settings, event.target.value as QuoteForm["service_category"], Number(form.quantity) || 0)}><option value="passenger">Passenger</option><option value="truck">Light truck</option><option value="commercial">Commercial</option></select></label>
        <QuoteField label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
        <QuoteField label="Expiration date" value={form.expires_at} type="date" onChange={(value) => setForm({ ...form, expires_at: value })} />
      </div></section>

      <section className="quote-option-grid">
        {options.map((option, index) => <div className={`quote-option-card ${option.recommended ? "recommended" : ""}`} key={option.tier}>
          <div className="quote-tier-row"><span className={`quote-tier ${option.tier}`}>{option.tier}</span><label><input type="radio" name="recommended" checked={option.recommended} onChange={() => setOptions((items) => items.map((item, itemIndex) => ({ ...item, recommended: itemIndex === index })))} /> Recommended</label></div>
          {option.image_url ? <img className="quote-tire-image" src={option.image_url} alt={`${option.brand} ${option.model}`} /> : <div className="quote-image-placeholder">Tire image preview</div>}
          <QuoteField label="Brand" value={option.brand} onChange={(value) => updateOption(index, "brand", value)} />
          <QuoteField label="Model" value={option.model} onChange={(value) => updateOption(index, "model", value)} />
          <QuoteField label="Image URL" value={option.image_url} onChange={(value) => updateOption(index, "image_url", value)} placeholder="Manufacturer or distributor image" />
          <QuoteField label="Price per tire" value={option.price_per_tire} type="number" onChange={(value) => updateOption(index, "price_per_tire", value)} />
          <details className="quote-advanced">
            <summary>Optional tire details</summary>
            <div className="quote-advanced-fields">
              <QuoteField label="Mileage warranty" value={option.warranty_miles} type="number" onChange={(value) => updateOption(index, "warranty_miles", value)} />
              <QuoteField label="Tire type" value={option.tire_type} onChange={(value) => updateOption(index, "tire_type", value)} placeholder="All-season, all-terrain..." />
              <QuoteField label="Load / speed rating" value={option.load_speed_rating} onChange={(value) => updateOption(index, "load_speed_rating", value)} />
              <QuoteField label="Snow rating" value={option.snow_rating} onChange={(value) => updateOption(index, "snow_rating", value)} placeholder="3PMSF, M+S..." />
              <QuoteField label="Availability" value={option.availability} onChange={(value) => updateOption(index, "availability", value)} placeholder="In stock, 2 days..." />
              <label className="quote-field"><span>Why choose it</span><textarea value={option.highlights} onChange={(event) => updateOption(index, "highlights", event.target.value)} placeholder="Quiet ride, strong snow traction..." /></label>
            </div>
          </details>
          <div className="quote-option-total">Installed total <strong>${totals[index].toFixed(2)}</strong></div>
        </div>)}
      </section>

      <section className="quote-form-card"><h2>Pricing and fees</h2><div className="quote-form-grid">
        <QuoteField label="Installation" value={form.installation_cost} type="number" onChange={(value) => setForm({ ...form, installation_cost: value })} />
        <QuoteField label="Service call" value={form.service_call_fee} type="number" onChange={(value) => setForm({ ...form, service_call_fee: value })} />
        <QuoteField label="Disposal total" value={form.disposal_fee} type="number" onChange={(value) => setForm({ ...form, disposal_fee: value })} />
        <QuoteField label="NY state fee total" value={form.ny_state_tire_fee} type="number" onChange={(value) => setForm({ ...form, ny_state_tire_fee: value })} />
        <QuoteField label="Sales-tax rate" value={form.sales_tax_rate} type="number" onChange={(value) => setForm({ ...form, sales_tax_rate: value })} />
        <label className="quote-field quote-check"><input type="checkbox" checked={form.tax_exempt} onChange={(event) => setForm({ ...form, tax_exempt: event.target.checked })} /> Tax-exempt customer</label>
        <label className="quote-field quote-full"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      </div></section>
    </main></div>
  );
}

function QuoteField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="quote-field"><span>{label}</span><input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}
