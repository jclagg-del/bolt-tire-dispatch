import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { atdEnvironment, fitmentList, searchAtdByFitment, searchAtdBySize } from "@/lib/atd";

async function staffAuthorized(request: NextRequest) {
  return Boolean(await requireApiUser(request));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const includeCost = Boolean(body.internal) && await staffAuthorized(request);
    if (body.action === "size") return NextResponse.json({ products: await searchAtdBySize(String(body.query || ""), includeCost), sandbox: atdEnvironment !== "production" });
    if (body.action === "fitment-products") return NextResponse.json({ products: await searchAtdByFitment(body.vehicle || {}, includeCost), sandbox: atdEnvironment !== "production" });
    if (["years", "makes", "models", "trims", "options"].includes(body.action)) return NextResponse.json(await fitmentList(body.action, body.selection || {}));
    return NextResponse.json({ error: "Invalid ATD action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ATD request failed" }, { status: 502 });
  }
}
