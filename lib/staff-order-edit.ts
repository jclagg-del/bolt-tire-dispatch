import { fleetOrderRequirementsError, fleetRequestedTime } from "@/lib/fleet-order-requirements";
import { orderAppointment } from "@/lib/order-appointment";

export const FLEET_CUSTOMERS = ["Kingdom Support Services", "HPR"];
export const ORDER_EDIT_FIELDS = ["customer", "goodyear_order", "service_method", "submitted_by", "contact_name", "contact_number", "facility_id", "facility_name", "address", "requested_date", "requested_time", "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_color", "license_plate", "job_number", "mo_number", "tire_position", "qty", "tire_size", "tire_model", "tire_product_number", "notes"] as const;
export const PURCHASE_LOCKED_FIELDS = ["customer", "goodyear_order", "job_number", "mo_number", "qty", "tire_size", "tire_product_number"] as const;
export type OrderEditFields = Record<typeof ORDER_EDIT_FIELDS[number], string | number | boolean | null>;
export type OrderRecord = Record<string, unknown>;

export function canEditFleetOrder(order: OrderRecord): boolean {
  return FLEET_CUSTOMERS.includes(String(order.customer)) && order.order_status === "new" && !order.approved_job_id && !order.source_quote_id && order.payment_status !== "paid" && !(Number(order.amount_paid) > 0) && !(Array.isArray(order.tire_items) && order.tire_items.length);
}

export function editableOrderFields(order: OrderRecord): OrderEditFields {
  return Object.fromEntries(ORDER_EDIT_FIELDS.map(key => [key, order[key] ?? null])) as OrderEditFields;
}

export function normalizeOrderEdit(input: unknown, previous: OrderRecord = {}): OrderEditFields {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid order changes.");
  const raw = { ...input } as OrderRecord;
  if (raw.tire_model === undefined) raw.tire_model = previous.tire_model ?? null;
  const values = {} as OrderEditFields;
  for (const key of ORDER_EDIT_FIELDS) {
    if (["goodyear_order", "qty", "facility_id"].includes(key)) continue;
    if (raw[key] != null && typeof raw[key] !== "string") throw new Error(`Invalid ${key.replaceAll("_", " ")}.`);
    const value = String(raw[key] ?? "").trim();
    if (value.length > (key === "notes" ? 10000 : 1000)) throw new Error(`${key.replaceAll("_", " ")} is too long.`);
    values[key] = value || null;
  }
  if (!FLEET_CUSTOMERS.includes(String(values.customer))) throw new Error("Choose Kingdom Support Services or HPR.");
  if (!["installed", "delivery", "pickup", "delivery_pickup"].includes(String(values.service_method))) throw new Error("Choose an order type.");
  if (typeof raw.goodyear_order !== "boolean") throw new Error("Choose whether this is a Goodyear order.");
  values.goodyear_order = raw.goodyear_order;
  if (typeof raw.qty !== "number" || !Number.isSafeInteger(raw.qty) || raw.qty < 1 || raw.qty > 2147483647) throw new Error("Quantity must be a positive whole number.");
  values.qty = raw.qty;
  if (raw.facility_id != null && (typeof raw.facility_id !== "number" || !Number.isSafeInteger(raw.facility_id) || raw.facility_id < 1)) throw new Error("Choose a valid facility.");
  values.facility_id = raw.facility_id as number | null ?? null;
  for (const key of ["submitted_by", "contact_name", "contact_number", "facility_name", "address", "vehicle_year", "vehicle_make", "vehicle_model", "tire_size"] as const) {
    if (!values[key]) throw new Error(`Please enter ${key.replaceAll("_", " ")}.`);
  }
  const requirement = fleetOrderRequirementsError(values);
  if (requirement) throw new Error(requirement);
  values.requested_time = fleetRequestedTime(values.requested_time);
  if (!values.requested_date || !orderAppointment(String(values.requested_date), String(values.requested_time))) throw new Error("Choose a valid requested date and time.");
  return values;
}

export function changedPurchaseFields(before: OrderRecord, after: OrderEditFields): boolean {
  return PURCHASE_LOCKED_FIELDS.some(key => String(before[key] ?? "").trim() !== String(after[key] ?? "").trim());
}
