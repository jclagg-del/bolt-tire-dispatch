import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { deliveryJobsForDate, type DeliveryJob } from "@/lib/delivery-manifest";
import { shiftRouteDate, validRouteDate } from "@/lib/route-order";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await requireApiUser(request);
    if (!user) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401, headers });
    const admin = createAdminClient();
    const { data: staff, error: staffError } = await admin.from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
    if (staffError || !staff || !["admin", "office", "technician"].includes(staff.role)) return NextResponse.json({ error: "Staff access is required." }, { status: 403, headers });
    const date = new URL(request.url).searchParams.get("date");
    if (!validRouteDate(date)) return NextResponse.json({ error: "Choose a valid delivery date." }, { status: 400, headers });
    const jobs: DeliveryJob[] = [];
    // Jobs use New York wall-clock timestamps. Read the whole selected day,
    // including completed jobs, rather than the route's remaining-stop list.
    for (let offset = 0; offset < 5000; offset += 500) {
      const { data, error } = await admin.from("jobs")
        .select("id,customer,facility_name,address,scheduled,service_type,complete,archived,job_status,po_number,mo_number,tires,size,qty")
        .in("customer", ["Kingdom Support Services", "HPR"])
        .gte("scheduled", `${date}T00:00:00`).lt("scheduled", `${shiftRouteDate(date, 1)}T00:00:00`)
        .order("id", { ascending: true }).range(offset, offset + 499);
      if (error || !data) throw new Error("Could not load deliveries.");
      jobs.push(...data);
      if (data.length < 500) return NextResponse.json({ date, jobs: deliveryJobsForDate(jobs, date) }, { headers });
    }
    return NextResponse.json({ error: "Too many deliveries to safely prepare one day. Please contact the office." }, { status: 422, headers });
  } catch {
    return NextResponse.json({ error: "Deliveries could not be loaded. Retry before printing; no jobs were changed." }, { status: 503, headers });
  }
}
