import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasKingdomAccess } from "@/lib/kingdom-auth";

export async function GET() {
  if (!await hasKingdomAccess()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: orders, error } = await admin.from("customer_orders").select(`
    id, submitted_at, requested_date, requested_time, job_number, mo_number, goodyear_order, service_method, facility_id, facility_name, address,
    vehicle_year, vehicle_make, vehicle_model, vehicle_color, license_plate, tire_position,
    qty, tire_size, tire_product_number, notes, order_status, tires_ordered, approved_job_id
  `).eq("customer", "Kingdom Support Services").order("submitted_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobIds = (orders || []).map((order) => order.approved_job_id).filter(Boolean);
  const { data: jobs } = jobIds.length ? await admin.from("jobs").select("id,scheduled,job_status,complete,completed_at").in("id", jobIds) : { data: [] };
  const jobsById = new Map((jobs || []).map((job) => [String(job.id), job]));
  return NextResponse.json((orders || []).map((order) => ({
    ...order,
    job: order.approved_job_id ? jobsById.get(String(order.approved_job_id)) || null : null,
  })), { headers: { "Cache-Control": "no-store" } });
}
