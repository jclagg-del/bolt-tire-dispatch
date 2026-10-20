import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { routeDate, validRouteDate, validRouteChange, validRouteAppointment } from "@/lib/route-order";

async function staff(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
  return !error && data && ["admin", "office", "technician"].includes(data.role) ? admin : null;
}

export async function GET(request: Request) {
  const admin = await staff(request);
  if (!admin) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 403 });
  const date = new URL(request.url).searchParams.get("date");
  if (!validRouteDate(date)) return NextResponse.json({ error: "Choose a valid route date." }, { status: 400 });
  const { data, error } = await admin.from("route_day_orders").select("vehicle_id,job_ids,revision").eq("route_date", date);
  if (error) return NextResponse.json({ error: "Saved route order could not be loaded. Refresh before rearranging stops." }, { status: 503 });
  return NextResponse.json({ orders: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const admin = await staff(request);
  if (!admin) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!validRouteChange(body) || body.date !== routeDate(new Date())) return NextResponse.json({ error: "Invalid route order. Refresh today's route and try again." }, { status: 400 });
  if ("appointment" in body) {
    if (!validRouteAppointment(body.appointment, body.jobIds, body.date)) return NextResponse.json({ error: "Choose a valid appointment date and time, today or later." }, { status: 400 });
    const appointment = body.appointment;
    const { data, error } = await admin.rpc("reschedule_route_stop", {
      p_date: body.date, p_vehicle_id: body.vehicleId, p_job_ids: body.jobIds, p_revision: body.revision,
      p_job_id: appointment.jobId, p_expected_scheduled: appointment.expectedScheduled, p_scheduled: appointment.scheduled,
    });
    if (error?.code === "40001") return NextResponse.json({ error: "This job or route changed while you were editing. The route has been refreshed; please try again." }, { status: 409 });
    if (error?.code === "22023") return NextResponse.json({ error: "Invalid appointment or route. Refresh and try again." }, { status: 400 });
    if (error || !data) return NextResponse.json({ error: "Could not confirm the appointment change. Refresh the route before trying again." }, { status: 503 });
    return NextResponse.json(data);
  }
  // Older clients may still save only the stop order, without rescheduling.
  const { data: jobs, error: jobsError } = await admin.from("jobs").select("id,vehicle_id,scheduled,complete,archived");
  if (jobsError) return NextResponse.json({ error: "Could not verify the current route." }, { status: 503 });
  const current = (jobs || []).filter(job => !job.complete && !job.archived && job.scheduled && routeDate(job.scheduled) === body.date && (job.vehicle_id || "stepvan") === body.vehicleId).map(job => String(job.id));
  if (current.length !== body.jobIds.length || current.some(id => !body.jobIds.includes(id))) return NextResponse.json({ error: "This route changed. Refresh before rearranging stops." }, { status: 409 });
  const values = { job_ids: body.jobIds, revision: body.revision + 1 };
  const query = body.revision === 0
    ? admin.from("route_day_orders").insert({ ...values, route_date: body.date, vehicle_id: body.vehicleId })
    : admin.from("route_day_orders").update(values).eq("route_date", body.date).eq("vehicle_id", body.vehicleId).eq("revision", body.revision);
  const { data, error } = await query.select("vehicle_id,job_ids,revision").maybeSingle();
  if (error?.code === "23505" || (!error && !data)) return NextResponse.json({ error: "Someone else changed this route. Refresh to see their order." }, { status: 409 });
  if (error) return NextResponse.json({ error: "Route order was not saved. Please refresh and try again." }, { status: 503 });
  return NextResponse.json({ order: data });
}
