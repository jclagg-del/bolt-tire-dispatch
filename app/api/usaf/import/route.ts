import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { importUsafInventory } from "@/lib/usaf-flat-file";

export const maxDuration = 300;

function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await importUsafInventory());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "U.S. AutoForce import failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!await requireApiUser(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await importUsafInventory());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "U.S. AutoForce import failed." }, { status: 500 });
  }
}
