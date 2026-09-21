import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasKingdomAccess } from "@/lib/kingdom-auth";
import { sendFleetOrderNotification } from "@/lib/fleet-order-notifications";

export async function GET() {
  if (!await hasKingdomAccess()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: orders, error } = await admin.from("customer_orders").select(`
    id, customer, submitted_at, submitted_by, contact_name, contact_number, requested_date, requested_time, job_number, mo_number, goodyear_order, service_method, facility_id, facility_name, address,
    vehicle_year, vehicle_make, vehicle_model, vehicle_color, license_plate, tire_position,
    qty, tire_size, tire_product_number, notes, order_status, tires_ordered, approved_job_id
  `).in("customer", ["Kingdom Support Services", "HPR"]).order("submitted_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobIds = (orders || []).map((order) => order.approved_job_id).filter(Boolean);
  const { data: jobs } = jobIds.length ? await admin.from("jobs").select("id,scheduled,job_status,complete,completed_at").in("id", jobIds) : { data: [] };
  const jobsById = new Map((jobs || []).map((job) => [String(job.id), job]));
  return NextResponse.json((orders || []).map((order) => ({
    ...order,
    job: order.approved_job_id ? jobsById.get(String(order.approved_job_id)) || null : null,
  })), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!await hasKingdomAccess()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const customer = String(body.customer || "");
  if (!["Kingdom Support Services", "HPR"].includes(customer)) {
    return NextResponse.json({ error: "A valid organization is required." }, { status: 400 });
  }

  const required = ["submitted_by", "contact_name", "contact_number", "facility_id", "facility_name", "address", "vehicle_year", "vehicle_make", "vehicle_model", "requested_date", "requested_time", "service_method", "tire_position", "qty", "tire_size"];
  const missing = required.find((field) => !String(body[field] ?? "").trim());
  if (missing) return NextResponse.json({ error: "Please complete all required order fields." }, { status: 400 });

  const quantity = Number(body.qty);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 24) {
    return NextResponse.json({ error: "A valid tire quantity is required." }, { status: 400 });
  }

  const order = {
    customer,
    goodyear_order: Boolean(body.goodyear_order),
    service_method: String(body.service_method),
    submitted_by: String(body.submitted_by).trim(),
    contact_name: String(body.contact_name).trim(),
    contact_number: String(body.contact_number).trim(),
    facility_id: Number(body.facility_id),
    facility_name: String(body.facility_name).trim(),
    address: String(body.address).trim(),
    vehicle_year: String(body.vehicle_year).trim(),
    vehicle_make: String(body.vehicle_make).trim(),
    vehicle_model: String(body.vehicle_model).trim(),
    vehicle_color: String(body.vehicle_color || "").trim() || null,
    license_plate: String(body.license_plate || "").trim() || null,
    requested_date: String(body.requested_date),
    requested_time: String(body.requested_time),
    job_number: String(body.job_number || "").trim() || null,
    mo_number: String(body.mo_number || "").trim() || null,
    tire_position: String(body.tire_position).trim(),
    qty: quantity,
    tire_size: String(body.tire_size).trim(),
    tire_product_number: String(body.tire_product_number || "").trim() || null,
    notes: String(body.notes || "").trim() || null,
    order_status: "new",
    tires_ordered: false,
  };

  const admin = createAdminClient();
  const { data: created, error } = await admin.from("customer_orders").insert(order).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notificationSent = false;
  let notificationError = "";
  try {
    await sendFleetOrderNotification("new", { id: created.id, ...order });
    notificationSent = true;
  } catch (notificationFailure) {
    notificationError = notificationFailure instanceof Error ? notificationFailure.message : "Email notification failed";
    console.error("New order email notification failed:", notificationError, { orderId: created.id });
  }

  return NextResponse.json({ orderId: created.id, notificationSent, ...(notificationError ? { notificationError } : {}) }, { status: 201 });
}
