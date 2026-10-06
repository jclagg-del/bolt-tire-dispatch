import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { quickBooksItems } from "@/lib/quickbooks-items";

export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401 });
  const { data: staff, error } = await createAdminClient().from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
  if (error || !staff || !["admin", "office", "technician"].includes(staff.role)) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  try { return NextResponse.json({ items: await quickBooksItems() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "QuickBooks items could not be loaded." }, { status: 503 }); }
}
