import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { NtwTestError, runNtwTest, testSize } from "@/lib/ntw-test";

export const runtime = "nodejs";
export const maxDuration = 30;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
// Best-effort per-instance guard; never treat this as a substitute for staff auth.
let inFlight = false;
let nextAttempt = 0;
export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    if (!user) return reply({ error: "Sign in to Bolt Tire first, then return to this page." }, 401);
    const staff = await createAdminClient().from("staff_security").select("role,password_change_required").eq("user_id", user.id).maybeSingle();
    if (staff.error) return reply({ error: "Employee access could not be verified." }, 503);
    if (!["admin", "office", "technician"].includes(staff.data?.role || "") || staff.data?.password_change_required !== false) return reply({ error: "A registered employee with completed password setup is required." }, 403);
    if (process.env.NTW_TEST_ENABLED !== "true") return reply({ error: "The temporary NTW test is disabled." }, 503);
    let body;
    try { body = await request.json(); } catch { return reply({ error: "Invalid request." }, 400); }
    testSize(body?.size);
    if (inFlight || Date.now() < nextAttempt) return reply({ error: "Please wait a few seconds before another test." }, 429);
    inFlight = true;
    nextAttempt = Date.now() + 5000;
    try { return reply(await runNtwTest(body.size)); } finally { inFlight = false; }
  } catch (error) {
    return reply({ error: error instanceof NtwTestError ? error.message : "The NTW test could not be completed. No orders were placed." }, error instanceof NtwTestError ? error.status : 500);
  }
}
