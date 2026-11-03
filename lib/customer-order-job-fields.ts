// The portal and jobs use identical names for these structured fields. Keep
// approval and subsequent portal edits on one mapping; legacy notes/vehicle
// summaries are retained separately for existing cards, labels and integrations.
export const customerOrderJobFieldNames = [
  "submitted_by", "tire_position", "license_plate",
  "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_color",
] as const;
type Field = typeof customerOrderJobFieldNames[number];
type OrderFields = Partial<Record<Field, string | null>>;
const text = (value?: string | null) => value?.trim() || null;

export function customerOrderJobFields(order: OrderFields): Record<Field, string | null> {
  return Object.fromEntries(customerOrderJobFieldNames.map(field => [field, text(order[field])])) as Record<Field, string | null>;
}

export function changedCustomerOrderJobFields(previous: OrderFields, next: OrderFields): Partial<Record<Field, string | null>> {
  const before = customerOrderJobFields(previous);
  const after = customerOrderJobFields(next);
  // An unrelated portal edit must not overwrite a technician's correction or
  // quietly backfill a historical job. Explicit portal changes (including a
  // cleared optional field) still propagate, just like an appointment edit.
  return Object.fromEntries(customerOrderJobFieldNames
    .filter(field => before[field] !== after[field])
    .map(field => [field, after[field]]));
}
