// The portal and jobs use identical names for these structured fields; the
// portal's tire_model maps to the existing job "tires" description. Keep
// approval and subsequent portal edits on one mapping; legacy notes/vehicle
// summaries are retained separately for existing cards, labels and integrations.
export const customerOrderJobFieldNames = [
  "submitted_by", "tire_position", "license_plate",
  "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_color",
] as const;
type Field = typeof customerOrderJobFieldNames[number];
type OrderFields = Partial<Record<Field | "tire_model", string | null>>;
type JobField = Field | "tires";
const text = (value?: string | null) => value?.trim() || null;

export function customerOrderJobFields(order: OrderFields): Record<JobField, string | null> {
  return { ...Object.fromEntries(customerOrderJobFieldNames.map(field => [field, text(order[field])])), tires: text(order.tire_model) } as Record<JobField, string | null>;
}

export function changedCustomerOrderJobFields(previous: OrderFields, next: OrderFields): Partial<Record<JobField, string | null>> {
  const before = customerOrderJobFields(previous);
  const after = customerOrderJobFields(next);
  // An unrelated portal edit must not overwrite a technician's correction or
  // quietly backfill a historical job. Explicit portal changes (including a
  // cleared optional field) still propagate, just like an appointment edit.
  return Object.fromEntries(([...customerOrderJobFieldNames, "tires"] as JobField[])
    .filter(field => before[field] !== after[field])
    .map(field => [field, after[field]]));
}
