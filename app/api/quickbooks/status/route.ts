import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data, error } = await admin.from("quickbooks_connections").select("realm_id,environment,updated_at").eq("id", true).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ connected: Boolean(data), connection: data });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Status unavailable" }, { status: 500 });
  }
}
