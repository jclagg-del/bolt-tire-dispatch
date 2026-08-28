import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { usaForceServiceCheck } from "@/lib/usaf";

export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await usaForceServiceCheck(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "U.S. AutoForce connection failed." }, { status: 502 });
  }
}
