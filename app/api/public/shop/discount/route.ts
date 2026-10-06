import { NextResponse } from "next/server";
import { lookupDiscount } from "@/lib/discounts-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = await lookupDiscount(body.code);
    if (!code) return NextResponse.json({ error: "Enter a discount code." }, { status: 400 });
    return NextResponse.json({ discount: { code: code.code, percent: Number(code.percent), discount_type: code.discount_type || "percent", fixed_amount: Number(code.fixed_amount || 0), organization: code.organization, tax_exempt: code.tax_exempt } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The code could not be checked." }, { status: 400 });
  }
}
