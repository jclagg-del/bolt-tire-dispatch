import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDiscountAdmin } from "@/lib/discounts-server";
import { discountCodeError, normalizeDiscountCode } from "@/lib/discounts";

export async function GET(request: Request) {
  if (!await requireDiscountAdmin(request)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { data, error } = await createAdminClient().from("discount_codes").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Discount settings could not be loaded." }, { status: 500 });
  return NextResponse.json({ codes: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await requireDiscountAdmin(request);
  if (!user) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Enter valid discount settings." }, { status: 400 });
  const value = {
    code: normalizeDiscountCode(body.code), description: String(body.description || "").trim().slice(0, 200),
    discount_type: body.discount_type ?? "percent",
    fixed_amount: body.discount_type === "fixed" ? Number(body.fixed_amount) : 0,
    percent: body.discount_type === "fixed" ? 0 : Number(body.percent), organization: String(body.organization || "").trim().slice(0, 150) || null,
    tax_exempt: body.tax_exempt === true, exemption_reference: String(body.exemption_reference || "").trim().slice(0, 300) || null,
    active: body.active === true, expires_on: body.expires_on ? String(body.expires_on) : null,
    updated_by: user.id, updated_at: new Date().toISOString(),
  };
  const validation = discountCodeError(value);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const admin = createAdminClient();
  if (body.id && !/^[0-9a-f-]{36}$/i.test(String(body.id))) return NextResponse.json({ error: "Invalid code ID." }, { status: 400 });
  const result = body.id
    ? await admin.from("discount_codes").update(value).eq("id", body.id).select("*").single()
    : await admin.from("discount_codes").insert({ ...value, created_by: user.id }).select("*").single();
  if (result.error) return NextResponse.json({ error: result.error.code === "23505" ? "That code already exists." : "The discount code could not be saved." }, { status: 400 });
  return NextResponse.json({ code: result.data });
}
