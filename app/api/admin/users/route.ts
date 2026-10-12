import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { createEmployee, resendEmployeeSetup, EmployeeUserError } from "@/lib/employee-users";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function authorize(request: Request) {
  const user = await requireApiUser(request);
  if (!user) throw new EmployeeUserError("Please sign in again.", 401);
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_security").select("role,password_change_required").eq("user_id", user.id).maybeSingle();
  if (error || data?.role !== "admin" || data.password_change_required) throw new EmployeeUserError("Admin access with a completed password setup is required.", 403);
  return { user, admin };
}
const failure = (error: unknown) => reply({ error: error instanceof EmployeeUserError ? error.message : "Employee accounts could not be updated. Refresh the list before trying again." }, error instanceof EmployeeUserError ? error.status : 500);

export async function GET(request: Request) {
  try {
    const { user, admin } = await authorize(request);
    const page = Math.max(0, Number(new URL(request.url).searchParams.get("page") || 0));
    if (!Number.isInteger(page) || page > 10000) throw new EmployeeUserError("Invalid page.");
    const { data, error } = await admin.from("staff_security").select("user_id,email,role,password_change_required").order("email").range(page * 50, page * 50 + 50);
    if (error) throw new EmployeeUserError("Employee accounts could not be loaded.", 500);
    return reply({ users: (data || []).slice(0, 50), hasMore: (data || []).length > 50, currentUserId: user.id });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { user, admin } = await authorize(request);
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { throw new EmployeeUserError("Invalid request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new EmployeeUserError("Invalid request.");
    if (body.action === "create") return reply(await createEmployee(admin, body), 201);
    if (body.action === "resend") return reply(await resendEmployeeSetup(admin, body, user.id));
    throw new EmployeeUserError("Choose Create employee or Send setup email.");
  } catch (error) { return failure(error); }
}
