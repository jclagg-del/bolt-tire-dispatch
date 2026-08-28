import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { usaForceStockCheck } from "@/lib/usaf";

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    return NextResponse.json(await usaForceStockCheck(String(body.tireSize || ""), Number(body.quantity || 4)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "U.S. AutoForce stock check failed." }, { status: 502 });
  }
}
