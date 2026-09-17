import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";

type CustomerOrder = {
  id: number;
  customer: string;
  goodyear_order: boolean | null;
  service_method: string | null;
  submitted_by: string | null;
  contact_name: string;
  contact_number: string;
  facility_id: number | null;
  facility_name: string | null;
  address: string;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  license_plate: string | null;
  requested_date: string;
  requested_time: string;
  job_number: string | null;
  mo_number: string | null;
  tire_position: string | null;
  qty: number;
  tire_size: string;
  tire_product_number: string | null;
  notes: string | null;
  order_status: string;
  tires_ordered: boolean;
  approved_job_id: number | null;
  reviewed_at: string | null;
};

function scheduledValue(order: CustomerOrder) {
  return `${order.requested_date}T${order.requested_time.substring(0, 5)}:00`;
}

function vehicleDescription(order: CustomerOrder) {
  const vehicle = [order.vehicle_year, order.vehicle_make, order.vehicle_model].filter(Boolean).join(" ");
  const details = [
    order.vehicle_color ? `Color: ${order.vehicle_color}` : "",
    order.license_plate ? `Plate: ${order.license_plate}` : "",
  ].filter(Boolean);
  return [vehicle, ...details].filter(Boolean).join(" • ");
}

function jobNotes(order: CustomerOrder) {
  const parts = [
    order.goodyear_order ? "Goodyear Order: Yes" : "",
    order.tire_position ? `Tire Position: ${order.tire_position}` : "",
    order.submitted_by ? `Submitted By: ${order.submitted_by}` : "",
    order.notes || "",
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

async function linkExistingJob(admin: ReturnType<typeof createAdminClient>, order: CustomerOrder) {
  if (!order.job_number?.trim()) return null;
  const { data, error } = await admin
    .from("jobs")
    .select("id")
    .eq("customer", order.customer)
    .eq("po_number", order.job_number.trim())
    .or("archived.eq.false,archived.is.null")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Existing-job check failed: ${error.message}`);
  if (!data) return null;
  const timestamp = new Date().toISOString();
  const { error: linkError } = await admin.from("customer_orders").update({
    order_status: "approved",
    approved_job_id: data.id,
    reviewed_at: timestamp,
    approved_at: timestamp,
  }).eq("id", order.id);
  if (linkError) throw new Error(`Existing job could not be linked: ${linkError.message}`);
  return data.id;
}

export async function POST(request: NextRequest) {
  if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { orderId } = await request.json();
    const id = Number(orderId);
    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "A valid order is required." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.from("customer_orders").select("*").eq("id", id).single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Order not found." }, { status: 404 });
    const order = data as CustomerOrder;
    if (order.approved_job_id) return NextResponse.json({ jobId: order.approved_job_id, existing: true });

    const existingJobId = await linkExistingJob(admin, order);
    if (existingJobId) return NextResponse.json({ jobId: existingJobId, existing: true });

    if (order.order_status === "approved" && order.reviewed_at) {
      const lockAge = Date.now() - new Date(order.reviewed_at).getTime();
      if (Number.isFinite(lockAge) && lockAge >= 0 && lockAge < 120_000) {
        return NextResponse.json({ error: "This order is already being approved. Refresh Orders in a moment." }, { status: 409 });
      }
    } else if (order.order_status !== "new") {
      return NextResponse.json({ error: `This order cannot be approved while its status is ${order.order_status}.` }, { status: 409 });
    }

    const lockTimestamp = new Date().toISOString();
    let claim = admin.from("customer_orders").update({
      order_status: "approved",
      reviewed_at: lockTimestamp,
      approved_at: lockTimestamp,
    }).eq("id", order.id).is("approved_job_id", null).eq("order_status", order.order_status);
    claim = order.reviewed_at ? claim.eq("reviewed_at", order.reviewed_at) : claim.is("reviewed_at", null);
    const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
    if (claimError) throw new Error(`Order approval could not start: ${claimError.message}`);
    if (!claimed) return NextResponse.json({ error: "This order was already accepted in another window." }, { status: 409 });

    const { data: newJob, error: jobError } = await admin.from("jobs").insert({
      customer: order.customer,
      contact_name: order.contact_name,
      phone: order.contact_number,
      address: order.address,
      facility_id: order.facility_id,
      facility_name: order.facility_name,
      vehicle: vehicleDescription(order) || null,
      scheduled: scheduledValue(order),
      po_number: order.job_number,
      mo_number: order.mo_number,
      qty: order.qty,
      size: order.tire_size,
      tire_product_number: order.tire_product_number,
      notes: jobNotes(order),
      tires_ordered: order.tires_ordered,
      submitted_by_customer: true,
      customer_order_status: "approved",
      vehicle_id: "stepvan",
      service_type: order.service_method === "pickup" ? "Pickup" : ["delivery", "delivered", "delivery_pickup"].includes(String(order.service_method || "").toLowerCase()) ? "Delivery" : "Installation",
      payment_status: "unpaid",
      job_status: "scheduled",
      complete: false,
      archived: false,
    }).select("id").single();

    if (jobError || !newJob) {
      await admin.from("customer_orders").update({ order_status: "new", reviewed_at: null, approved_at: null })
        .eq("id", order.id).eq("reviewed_at", lockTimestamp).is("approved_job_id", null);
      throw new Error(jobError?.message || "No job was returned.");
    }

    const { error: linkError } = await admin.from("customer_orders").update({ approved_job_id: newJob.id })
      .eq("id", order.id).eq("reviewed_at", lockTimestamp).is("approved_job_id", null);
    if (linkError) throw new Error(`The job was created, but the order could not be linked: ${linkError.message}`);

    return NextResponse.json({ jobId: newJob.id, created: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The order could not be approved." }, { status: 500 });
  }
}
