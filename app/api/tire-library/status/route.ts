import { NextResponse } from "next/server";
import { tireLibraryStatus } from "@/lib/tire-library";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await tireLibraryStatus();
  return NextResponse.json(
    {
      connected: status.connected,
      configured: status.configured,
      error: status.connected ? null : status.error || (status.configured ? "Connection failed" : "TIRE_LIBRARY_API_KEY is missing in this deployment"),
    },
    { status: status.connected ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
