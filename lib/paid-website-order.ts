/** Snapshots come from the server's saved quote, never the checkout request. */
export type WebsiteQuote = {
  id: string; quote_number: number; customer: string; contact_name?: string | null;
  phone?: string | null; email?: string | null; vehicle?: string | null; address?: string | null;
  quantity: number; rear_quantity?: number | null; tire_size?: string | null; rear_tire_size?: string | null;
  installation_cost: number; service_call_fee: number; disposal_fee: number; ny_state_tire_fee: number;
  tax_exempt: boolean; amount_paid: number; stripe_sales_tax_amount?: number | null; paid_at: string;
  discount_code_label?: string | null; discount_organization?: string | null; discount_amount?: number;
  requested_date?: string | null; requested_time?: string | null; notes?: string | null;
  checkout_service?: string | null;
};
export type WebsiteOption = {
  id: string; brand: string; model: string; price_per_tire: number; supplier?: string | null;
  supplier_product_id?: string | null; manufacturer_product_id?: string | null;
  rear_brand?: string | null; rear_model?: string | null; rear_price_per_tire?: number | null;
  rear_supplier?: string | null; rear_supplier_product_id?: string | null; rear_manufacturer_product_id?: string | null;
};
export function websiteTireItems(q: WebsiteQuote, o: WebsiteOption) {
  const items = [{ quantity: Number(q.quantity), size: q.tire_size || "", brand: o.brand, model: o.model,
    part: o.supplier_product_id || o.manufacturer_product_id || "", supplier: o.supplier || "", price: Number(o.price_per_tire) }];
  if (Number(q.rear_quantity) > 0) items.push({ quantity: Number(q.rear_quantity), size: q.rear_tire_size || "",
    brand: o.rear_brand || o.brand, model: o.rear_model || o.model,
    part: o.rear_supplier_product_id || o.rear_manufacturer_product_id || "", supplier: o.rear_supplier || "", price: Number(o.rear_price_per_tire || 0) });
  return items;
}
export function websitePaymentFields(q: WebsiteQuote, o: WebsiteOption) {
  const items = websiteTireItems(q, o);
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const tireTotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const taxable = tireTotal + Number(q.installation_cost) + Number(q.service_call_fee) + Number(q.disposal_fee);
  const tax = Number(q.stripe_sales_tax_amount || 0);
  return {
    source_quote_id: q.id, email: q.email || null, vehicle: q.vehicle || null,
    qty: quantity, tires: items.map(i => `${i.brand} ${i.model}`).join(" / "),
    size: items.map(i => i.size).join(" / "), tire_product_number: items.map(i => i.part).join(" / "),
    price_tires: tireTotal / quantity, installation_cost: Number(q.installation_cost) + Number(q.service_call_fee),
    tire_disposal_fee: Number(q.disposal_fee), ny_state_tire_fee: Number(q.ny_state_tire_fee),
    subtotal: Math.round((taxable + Number(q.ny_state_tire_fee)) * 100) / 100,
    sales_tax_amount: tax, sales_tax_rate: q.tax_exempt ? 0 : taxable > 0 ? tax / taxable * 100 : 0,
    tax_exempt: Boolean(q.tax_exempt), job_total: Number(q.amount_paid), payment_status: "paid", paid_date: q.paid_at,
  };
}
export function paidWebsiteOrder(q: WebsiteQuote, o: WebsiteOption) {
  const items = websiteTireItems(q, o);
  const organization = q.discount_organization?.trim() || q.customer;
  return {
    source_quote_id: q.id, customer: organization.toUpperCase() === "KSS" ? "Kingdom Support Services" : organization,
    contact_name: q.contact_name || q.customer, contact_number: q.phone || "", address: q.address || "",
    submitted_by: q.contact_name || q.customer, vehicle_model: q.vehicle || null,
    requested_date: q.requested_date || null, requested_time: q.requested_time || null,
    service_method: q.checkout_service === "tires_only" ? null : "installed",
    job_number: `WEB-${q.quote_number}`, qty: items.reduce((sum, i) => sum + i.quantity, 0),
    tire_size: items.map(i => i.size).join(" / "), tire_product_number: items.length === 1 ? items[0].part : null,
    tire_items: items, goodyear_order: false, order_status: "new", tires_ordered: false,
    payment_status: "paid", amount_paid: Number(q.amount_paid), paid_at: q.paid_at,
    tax_exempt: Boolean(q.tax_exempt), discount_code_label: q.discount_code_label || null,
    discount_amount: Number(q.discount_amount || 0),
    notes: [q.notes, `Paid online: $${Number(q.amount_paid).toFixed(2)}. Do not charge again.`,
      `Discount code: ${q.discount_code_label}. Tire savings: $${Number(q.discount_amount || 0).toFixed(2)}.`,
      q.tax_exempt ? "Approved sales-tax exemption applies to tires and services." : "",
      "Outside the Goodyear program. Tires have NOT been purchased from a supplier.",
      ...items.map(i => `${i.quantity} × ${i.size} ${i.brand} ${i.model} · Part ${i.part} · Selected supplier ${i.supplier}`),
    ].filter(Boolean).join("\n"),
  };
}
