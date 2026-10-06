"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { AdditionalItem, QuickBooksItem, additionalItemAmount, additionalItemsTotals } from "@/lib/additional-items";
import styles from "./AdditionalItemsEditor.module.css";

export default function AdditionalItemsEditor({ items, onChange, disabled = false, context = "quote" }: { items: AdditionalItem[]; onChange: (items: AdditionalItem[]) => void; disabled?: boolean; context?: "quote" | "job" }) {
  const [catalog, setCatalog] = useState<QuickBooksItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => {
    setLoading(true); setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/quickbooks/items", { headers: { Authorization: `Bearer ${data.session?.access_token || ""}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load QuickBooks items.");
      setCatalog(result.items);
      if (!result.items.length) setMessage("No active invoiceable products or services were found in QuickBooks.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load QuickBooks items."); }
    finally { setLoading(false); }
  };
  const update = (index: number, patch: Partial<AdditionalItem>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <section className={styles.section}>
    <div className={styles.heading}><div><h2>Additional items &amp; services</h2><p>{context === "quote" ? "Included in every tire option. Select a QuickBooks item now, or map it on the job before invoicing." : "Included in the job total. Match each line to a QuickBooks item, then save before creating the invoice."}</p></div><button type="button" disabled={disabled || loading} onClick={load}>{loading ? "Loading…" : "Load QuickBooks items"}</button></div>
    {message && <p role="status">{message}</p>}
    {items.map((item, index) => <fieldset disabled={disabled} className={styles.row} key={index}><legend>Item {index + 1}</legend>
      <label className={styles.wide}>QuickBooks product / service<select value={item.quickbooks_item_id || ""} onChange={e => {
        const product = catalog.find(product => product.id === e.target.value);
        update(index, product ? { quickbooks_item_id: product.id, quickbooks_item_name: product.name, quickbooks_company_id: product.company_id,
          ...(!item.description.trim() ? { description: product.description, unit_price: product.unit_price, taxable: product.taxable } : {}) } : { quickbooks_item_id: "", quickbooks_item_name: "", quickbooks_company_id: "" });
      }}><option value="">Not mapped — choose before invoicing</option>{item.quickbooks_item_id && !catalog.some(product => product.id === item.quickbooks_item_id) && <option value={item.quickbooks_item_id}>{item.quickbooks_item_name || "Saved mapping"}</option>}{catalog.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <label className={styles.wide}>Description<input aria-label={`Item ${index + 1} description`} value={item.description} maxLength={500} placeholder="TPMS sensor, valve stem, additional labor…" onChange={e => update(index, { description: e.target.value })} /></label>
      <label>Quantity<input aria-label={`Item ${index + 1} quantity`} type="number" min="0.01" max="10000" step="0.01" value={item.quantity} onChange={e => update(index, { quantity: Number(e.target.value) })} /></label>
      <label>Unit price ($)<input aria-label={`Item ${index + 1} unit price`} type="number" min="0" max="1000000" step="0.01" value={item.unit_price} onChange={e => update(index, { unit_price: Number(e.target.value) })} /></label>
      <label className={styles.tax}><input type="checkbox" checked={item.taxable} onChange={e => update(index, { taxable: e.target.checked })} />Taxable</label>
      <div className={styles.amount}><strong>${additionalItemAmount(item).toFixed(2)}</strong><button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove item ${index + 1}`}>Remove</button></div>
    </fieldset>)}
    <div className={styles.heading}><button type="button" disabled={disabled || items.length >= 50} onClick={() => onChange([...items, { description: "", quantity: 1, unit_price: 0, taxable: true }])}>+ Add item or service</button><strong>Additional subtotal: ${additionalItemsTotals(items).total.toFixed(2)}</strong></div>
  </section>;
}
