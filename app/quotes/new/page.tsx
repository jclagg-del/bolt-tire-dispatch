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
  service_category: "passenger" | "truck" | "commercial" | "medium_dismount" | "trailer_atv" | "off_road" | "tires_only";
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
  const [uploadingTier, setUploadingTier] = useState<string | null>(null);
  const [draggingTier, setDraggingTier] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from("business_settings").select("*").eq("id", true).maybeSingle();
      const next = (data as BusinessSettings | null) || fallbackBusinessSettings;
      setSettings(next);
      applyPricing(next, "passenger", 4);
    };
    loadSettings();

    const stored = sessionStorage.getItem("bolt-tire-quote-selection");
    if (stored) {
      try {
        const selection = JSON.parse(stored) as { tireSize?: string; products?: Array<{ brand:string; model:string; imageUrl:string|null; quotePrice:number; warranty:string; category:string; loadSpeed:string; snowRated:boolean; availability:{local:number;localPlus:number;nationwide:number} }> };
        const chosen = (selection.products || []).slice(0, 3);
        if (chosen.length) {
          const tiers: QuoteOption["tier"][] = ["good", "better", "best"];
          setForm((current) => ({ ...current, tire_size: selection.tireSize || current.tire_size }));
          setOptions(emptyQuoteOptions.map((option, index) => {
            const tire = chosen[index];
            if (!tire) return { ...option };
            const stock = tire.availability.local || tire.availability.localPlus;
            return {
              ...option, tier: tiers[index], brand: tire.brand, model: tire.model, image_url: tire.imageUrl || "",
              price_per_tire: String(tire.quotePrice), warranty_miles: (tire.warranty.match(/[\d,]+/)?.[0] || "").replace(/,/g, ""),
              tire_type: tire.category, load_speed_rating: tire.loadSpeed, snow_rating: tire.snowRated ? "3PMSF" : "",
              availability: stock ? `In stock (${stock})` : "Special order", recommended: index === Math.min(1, chosen.length - 1),
            };
          }));
          sessionStorage.removeItem("bolt-tire-quote-selection");
        }
      } catch { sessionStorage.removeItem("bolt-tire-quote-selection"); }
    }
  }, []);

  const applyPricing = (pricing: BusinessSettings, category: QuoteForm["service_category"], quantity: number) => {
    const disposalEach = category === "tires_only" ? 0 : category === "passenger" || category === "trailer_atv" || category === "off_road" ? pricing.passenger_disposal_fee : category === "truck" ? pricing.truck_disposal_fee : pricing.commercial_disposal_fee;
    const installation = installationDefault(pricing, quantity, category);
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

  const uploadPhoto = async (index: number, file?: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) return alert("Use a JPEG, PNG, or WebP image.");
    if (file.size > 8 * 1024 * 1024) return alert("The image must be smaller than 8 MB.");
    const option = options[index];
    setUploadingTier(option.tier);
    const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : ({ "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" }[file.type] || "jpg");
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("quote-images").upload(path, file, { contentType: file.type, upsert: false });
    if (error) { setUploadingTier(null); return alert(`Could not upload photo: ${error.message}`); }
    const { data } = supabase.storage.from("quote-images").getPublicUrl(path);
    updateOption(index, "image_url", data.publicUrl);
    setUploadingTier(null);
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
        <label className="quote-field"><span>Pricing category</span><select value={form.service_category} onChange={(event) => applyPricing(settings, event.target.value as QuoteForm["service_category"], Number(form.quantity) || 0)}><option value="passenger">Passenger - mount & balance</option><option value="tires_only">Loose tires only - no installation</option><option value="off_road">Off-road / ATV installation</option><option value="trailer_atv">Trailer installation</option><option value="truck">Light / medium truck - mount & balance</option><option value="commercial">Heavy truck - mount & balance</option><option value="medium_dismount">Medium truck - mount & dismount</option></select></label>
        <QuoteField label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
        <QuoteField label="Expiration date" value={form.expires_at} type="date" onChange={(value) => setForm({ ...form, expires_at: value })} />
      </div></section>

      <section className="quote-option-grid">
        {options.map((option, index) => <div className={`quote-option-card ${option.recommended ? "recommended" : ""}`} key={option.tier}>
          <div className="quote-tier-row"><span className={`quote-tier ${option.tier}`}>{option.tier}</span><label><input type="radio" name="recommended" checked={option.recommended} onChange={() => setOptions((items) => items.map((item, itemIndex) => ({ ...item, recommended: itemIndex === index })))} /> Recommended</label></div>
          <label className={`quote-photo-drop ${draggingTier === option.tier ? "dragging" : ""}`} tabIndex={0} onPaste={(event) => { const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile(); if (image) { event.preventDefault(); uploadPhoto(index, image); } }} onDragOver={(event) => { event.preventDefault(); setDraggingTier(option.tier); }} onDragLeave={() => setDraggingTier(null)} onDrop={(event) => { event.preventDefault(); setDraggingTier(null); uploadPhoto(index, event.dataTransfer.files[0]); }}>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadPhoto(index, event.target.files?.[0]); event.target.value = ""; }} />
            {option.image_url ? <img className="quote-tire-image" src={option.image_url} alt={`${option.brand} ${option.model}`} /> : <div className="quote-image-placeholder">{uploadingTier === option.tier ? "Uploading photo..." : "Paste, drag, or tap to add a tire photo"}</div>}
            {option.image_url ? <span className="quote-photo-change">Paste, drop, or tap to replace photo</span> : <span className="quote-photo-paste-hint">Click this box, then press ⌘V</span>}
          </label>
          <QuoteField label="Brand" value={option.brand} onChange={(value) => updateOption(index, "brand", value)} />
          <QuoteField label="Model" value={option.model} onChange={(value) => updateOption(index, "model", value)} />
          <details className="quote-image-url"><summary>Or use an image URL</summary><QuoteField label="Image URL" value={option.image_url} onChange={(value) => updateOption(index, "image_url", value)} placeholder="Manufacturer or distributor image" /></details>
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
  return <label className="quote-field"><span>{label}</span><input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}
