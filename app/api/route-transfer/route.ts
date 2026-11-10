import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { routeDate, validRouteDateTime } from "@/lib/route-order";

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 403 });
  const admin = createAdminClient();
  const { data: staff, error: staffError } = await admin.from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
  if (staffError || !staff || !["admin", "office", "technician"].includes(staff.role)) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || body.date !== routeDate(new Date()) || typeof body.jobId !== "string" || !/^\d{1,19}$/.test(body.jobId)
    || typeof body.fromVehicleId !== "string" || !body.fromVehicleId || body.fromVehicleId.length > 100
    || typeof body.toVehicleId !== "string" || !body.toVehicleId || body.toVehicleId.length > 100
    || body.fromVehicleId === body.toVehicleId || !validRouteDateTime(body.expectedScheduled)
    || routeDate(body.expectedScheduled) !== body.date) {
    return NextResponse.json({ error: "Refresh today's route and choose another vehicle." }, { status: 400 });
  }
  const { data: vehicle, error: vehicleError } = await admin.from("vehicles").select("id,active").eq("id", body.toVehicleId).maybeSingle();
  if (vehicleError) return NextResponse.json({ error: "Could not verify the destination vehicle. Please retry." }, { status: 503 });
  if (!vehicle?.active) return NextResponse.json({ error: "Choose an active service vehicle." }, { status: 400 });
  const { data: job, error: jobError } = await admin.from("jobs").select("id,vehicle_id,scheduled,complete,archived").eq("id", body.jobId).maybeSingle();
  if (jobError) return NextResponse.json({ error: "Could not load the job. Please retry." }, { status: 503 });
  if (!job || job.complete || job.archived || routeDate(job.scheduled || "") !== body.date
    || (job.vehicle_id || "stepvan") !== body.fromVehicleId) {
    return NextResponse.json({ error: "This job changed while you were moving it. Refresh the route and try again." }, { status: 409 });
  }
  // One conditional job update: never change the customer's vehicle, appointment,
  // technician assignments, payment or completion data. Saved route lists tolerate
  // departed stops and append arrivals, just as they do newly scheduled jobs.
  let update = admin.from("jobs").update({ vehicle_id: body.toVehicleId }).eq("id", body.jobId)
    .eq("scheduled", body.expectedScheduled)
    .or("complete.is.null,complete.eq.false").or("archived.is.null,archived.eq.false");
  update = job.vehicle_id == null ? update.is("vehicle_id", null) : update.eq("vehicle_id", job.vehicle_id);
  const { data: saved, error: saveError } = await update.select("id,vehicle_id,scheduled").maybeSingle();
  if (saveError) return NextResponse.json({ error: "Could not confirm the vehicle change. Refresh the route before trying again." }, { status: 503 });
  if (!saved) return NextResponse.json({ error: "This job changed while you were moving it. Refresh the route and try again." }, { status: 409 });
  return NextResponse.json({ job: saved });
}
