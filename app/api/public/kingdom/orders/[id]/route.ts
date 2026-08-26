import { NextResponse } from "next/server";
import { hasKingdomAccess } from "@/lib/kingdom-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!await hasKingdomAccess()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();
  const { data: order, error } = await admin.from("customer_orders").select("*").eq("id", id).eq("customer", "Kingdom Support Services").single();
  if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  let linkedJob: { id: string | number; complete: boolean | null } | null = null;
  if (order.approved_job_id) {
    const { data } = await admin.from("jobs").select("id,complete").eq("id", order.approved_job_id).single();
    linkedJob = data;
  }
  if (linkedJob?.complete) return NextResponse.json({ error: "Completed jobs can no longer be changed or cancelled." }, { status: 409 });

  if (body.action === "request_cancellation") {
    const { error: cancellationError } = await admin.from("customer_orders").update({ order_status: "cancellation_requested", reviewed_at: null }).eq("id", order.id);
    if (cancellationError) return NextResponse.json({ error: cancellationError.message }, { status: 500 });
    return NextResponse.json({ cancelled: true });
  }

  const serviceMethod = body.service_method === "delivery_pickup" ? "delivery_pickup" : "installed";
  const qty = Number(body.qty);
  const requestedDate = String(body.requested_date || "").trim();
  const requestedTime = String(body.requested_time || "").trim().substring(0, 5);
  if (!String(body.submitted_by || "").trim() || !String(body.contact_name || "").trim() || !String(body.contact_number || "").trim()) {
    return NextResponse.json({ error: "Submitted by, contact name, and contact number are required." }, { status: 400 });
  }
  if (!String(body.facility_name || "").trim() || !String(body.address || "").trim()) {
    return NextResponse.json({ error: "Facility and service address are required." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !/^\d{2}:\d{2}$/.test(requestedTime)) {
    return NextResponse.json({ error: "A valid appointment date and time are required." }, { status: 400 });
  }
  if (!String(body.vehicle_year || "").trim() || !String(body.vehicle_make || "").trim() || !String(body.vehicle_model || "").trim()) {
    return NextResponse.json({ error: "Vehicle year, make, and model are required." }, { status: 400 });
  }
  if (!Number.isFinite(qty) || qty < 1 || !String(body.tire_size || "").trim()) {
    return NextResponse.json({ error: "A valid tire quantity and tire size are required." }, { status: 400 });
  }

  const updates = {
    goodyear_order: Boolean(body.goodyear_order),
    service_method: serviceMethod,
    submitted_by: String(body.submitted_by).trim(),
    contact_name: String(body.contact_name).trim(),
    contact_number: String(body.contact_number).trim(),
    requested_date: requestedDate,
    requested_time: requestedTime,
    facility_id: body.facility_id ? Number(body.facility_id) : null,
    facility_name: String(body.facility_name || "").trim() || null,
    address: String(body.address || "").trim() || order.address,
    vehicle_year: String(body.vehicle_year).trim(),
    vehicle_make: String(body.vehicle_make).trim(),
    vehicle_model: String(body.vehicle_model).trim(),
    vehicle_color: String(body.vehicle_color || "").trim() || null,
    license_plate: String(body.license_plate || "").trim() || null,
    job_number: String(body.job_number || "").trim() || null,
    mo_number: String(body.mo_number || "").trim() || null,
    tire_position: String(body.tire_position || "").trim() || null,
    qty,
    tire_size: String(body.tire_size).trim(),
    tire_product_number: String(body.tire_product_number || "").trim() || null,
    notes: String(body.notes || "").trim() || null,
  };
  const { error: updateError } = await admin.from("customer_orders").update(updates).eq("id", order.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (updates.facility_id) {
    const { error: facilityError } = await admin.from("kingdom_facilities").update({ contact_name: updates.contact_name, contact_number: updates.contact_number }).eq("id", updates.facility_id);
    if (facilityError) return NextResponse.json({ error: `Order saved, but the facility contact could not be updated: ${facilityError.message}` }, { status: 500 });
  }

  if (linkedJob) {
    const vehicle = [updates.vehicle_year, updates.vehicle_make, updates.vehicle_model, updates.vehicle_color && `Color: ${updates.vehicle_color}`, updates.license_plate && `Plate: ${updates.license_plate}`].filter(Boolean).join(" • ");
    const notes = [updates.goodyear_order ? "Goodyear Order: Yes" : null, updates.tire_position && `Tire Position: ${updates.tire_position}`, `Submitted By: ${updates.submitted_by}`, updates.notes].filter(Boolean).join("\n") || null;
    const { error: jobError } = await admin.from("jobs").update({
      vehicle, po_number: updates.job_number, mo_number: updates.mo_number,
      facility_id: updates.facility_id, facility_name: updates.facility_name, address: updates.address,
      contact_name: updates.contact_name, phone: updates.contact_number,
      scheduled: `${updates.requested_date}T${updates.requested_time}:00`,
      qty: updates.qty, size: updates.tire_size, tire_product_number: updates.tire_product_number,
      notes, service_type: serviceMethod === "delivery_pickup" ? "Delivery" : "Installation",
    }).eq("id", linkedJob.id);
    if (jobError) return NextResponse.json({ error: `Order saved, but the linked job could not be updated: ${jobError.message}` }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
