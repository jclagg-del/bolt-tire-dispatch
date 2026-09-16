import { NextResponse } from "next/server";
import { tireLibraryStatus } from "@/lib/tire-library";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await tireLibraryStatus();
  return NextResponse.json(
    { connected: status.connected },
    { status: status.connected ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
