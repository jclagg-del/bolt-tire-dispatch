import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasKingdomAccess } from "@/lib/kingdom-auth";

export async function GET() {
  if (!await hasKingdomAccess()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("kingdom_facilities").select("id,name,address").eq("active", true).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || [], { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!await hasKingdomAccess()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const name = String(body.name || "").trim();
  const address = String(body.address || "").trim();
  if (!name || !address) return NextResponse.json({ error: "Facility name and address are required." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("kingdom_facilities").insert({ name, address }).select("id,name,address").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That facility is already saved." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json(data, { status: 201 });
}
