import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { disconnectQuickBooks } from "@/lib/quickbooks";

export async function POST(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await disconnectQuickBooks();
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Disconnect failed." }, { status: 500 });
  }
}
