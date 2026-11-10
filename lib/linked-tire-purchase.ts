import type { createAdminClient } from "@/lib/supabase/admin";
type Row = Record<string, any>;
export type PurchaseTarget = { table: "jobs" | "customer_orders"; id: string | number; before: Row; values: Row };

// Store this server-built snapshot with the supplier receipt. Retries can finish
// an interrupted sync without purchasing again or replacing later manual edits.
export function purchaseTargets(job: Row | null, order: Row | null, product: Row, details: { supplier: string; deliveryDate: string | null }): PurchaseTarget[] {
  const targets: PurchaseTarget[] = [];
  const name = [product.brand, product.model].filter(Boolean).join(" ");
  function target(table: PurchaseTarget["table"], row: Row, values: Row, guards: string[]) {
    const keys = [...new Set([...Object.keys(values), ...guards])];
    targets.push({ table, id: row.id, before: Object.fromEntries(keys.map(key => [key, row[key] ?? null])), values });
  }
  if (job) target("jobs", job, { tire_product_number: product.atdProductNumber, tire_manufacturer_part_number: product.manufacturerProductNumber || null, tires: name, tires_ordered: true, tire_supplier: details.supplier, estimated_delivery_date: details.deliveryDate }, ["qty", "size", "po_number", "complete", "archived"]);
  if (order) target("customer_orders", order, { tire_product_number: product.atdProductNumber, tire_model: name, tires_ordered: true }, ["qty", "tire_size", "job_number", "order_status", "approved_job_id"]);
  return targets;
}

export async function syncPurchaseTargets(admin: ReturnType<typeof createAdminClient>, targets: PurchaseTarget[]) {
  const warnings: string[] = [];
  for (const target of targets) {
    let query = admin.from(target.table).update(target.values).eq("id", target.id);
    for (const [field, value] of Object.entries(target.before)) query = value == null ? query.is(field, null) : query.eq(field, value);
    const saved = await query.select("id").maybeSingle();
    if (saved.error) { warnings.push(`${target.table} ${target.id}: ${saved.error.message}`); continue; }
    if (saved.data) continue;
    // A repeated receipt may already have been applied. Otherwise leave the
    // changed fields alone and make reconciliation explicit to the office.
    const current = await admin.from(target.table).select(Object.keys(target.before).join(",")).eq("id", target.id).maybeSingle();
    // Approval/completion may legitimately change status after a successful
    // sync. If the purchased fields and fitment already match, do not rewrite
    // them or report a false failure solely because the workflow moved on.
    const expected = { ...Object.fromEntries(["qty", "size", "tire_size"].filter(key => key in target.before).map(key => [key, target.before[key]])), ...target.values };
    if (current.error || !current.data || Object.entries(expected).some(([field, value]) => ((current.data as Row)[field] ?? null) !== value)) warnings.push(`${target.table} ${target.id} changed after purchase review; its fields were not overwritten.`);
  }
  return warnings.join("; ");
}
