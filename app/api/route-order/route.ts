import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { routeDate, validRouteChange } from "@/lib/route-order";

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
  if (date !== routeDate(new Date())) return NextResponse.json({ error: "Refresh the Route page for today's jobs." }, { status: 400 });
  const { data, error } = await admin.from("route_day_orders").select("vehicle_id,job_ids,revision").eq("route_date", date);
  if (error) return NextResponse.json({ error: "Saved route order could not be loaded. Refresh before rearranging stops." }, { status: 503 });
  return NextResponse.json({ orders: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const admin = await staff(request);
  if (!admin) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!validRouteChange(body) || body.date !== routeDate(new Date())) return NextResponse.json({ error: "Invalid route order. Refresh today's route and try again." }, { status: 400 });
  // This endpoint only saves stop order. It never updates jobs, times or vehicles.
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
