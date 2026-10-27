import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { quickBooksHealth } from "@/lib/quickbooks-health";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ connected: false, error: "Please sign in again." }, { status: 401, headers });
    return NextResponse.json(await quickBooksHealth(new URL(request.url).searchParams.get("test") === "1"), { headers });
  } catch (error) {
    return NextResponse.json({ connected: false, healthy: false, error: error instanceof Error ? error.message : "Status unavailable" }, { status: 503, headers });
  }
}
