import { NextResponse } from "next/server";
import { availableShopTimes } from "@/lib/shop-availability";

export async function POST(request: Request) {
  try {
    const { date } = await request.json();
    return NextResponse.json({ times: await availableShopTimes(String(date || "")) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Availability could not be loaded" }, { status: 500 });
  }
}
