import { NextResponse } from "next/server";
import { grantKingdomAccess, hasKingdomAccess, validKingdomPin } from "@/lib/kingdom-auth";

export async function GET() {
  return NextResponse.json({ authenticated: await hasKingdomAccess() });
}

export async function POST(request: Request) {
  const { pin } = await request.json();
  if (!validKingdomPin(String(pin || ""))) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }
  await grantKingdomAccess();
  return NextResponse.json({ authenticated: true });
}

