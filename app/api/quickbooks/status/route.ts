import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { getConnection } from "@/lib/quickbooks";

export async function GET(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const connection = await getConnection();
    return NextResponse.json({ connected: true, environment: process.env.QUICKBOOKS_ENVIRONMENT || "sandbox", expiresAt: connection.access_expires_at });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Status unavailable" }, { status: 500 });
  }
}
