import "server-only";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function jhaAccess(request: Request, id: string) {
  const user = await requireApiUser(request);
  if (!user) return { error: NextResponse.json({ error: "Staff sign-in required." }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: staff, error } = await admin.from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
  if (error || !staff || !["admin", "office", "technician"].includes(staff.role)) return { error: NextResponse.json({ error: "Staff access required." }, { status: 403 }) };
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) return { error: NextResponse.json({ error: "Invalid job." }, { status: 400 }) };
  const { data: job, error: jobError } = await admin.from("jobs").select("id,customer,po_number,service_type,address,scheduled,vehicle,tires,size,qty,complete,archived").eq("id", id).maybeSingle();
  if (jobError) return { error: NextResponse.json({ error: "Unable to verify job access." }, { status: 503 }) };
  if (!job) return { error: NextResponse.json({ error: "Job not found." }, { status: 404 }) };
  return { admin, user, job };
}
export const jhaUnavailable = () => NextResponse.json({ error: "JHA storage is unavailable. Please contact the office; completion cannot be verified." }, { status: 503 });
