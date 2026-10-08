import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdditionalItem } from "@/lib/additional-items";
import { settledQuote } from "@/lib/quote-payment-pricing";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.from("quotes").select("id,quote_number,status,customer,contact_name,address,email,phone,vehicle,tire_size,quantity,rear_tire_size,rear_quantity,notes,additional_items,installation_cost,service_call_fee,disposal_fee,ny_state_tire_fee,sales_tax_rate,tax_exempt,discount_code_label,discount_amount,discount_organization,selected_option_id,expires_at,payment_status,amount_paid,stripe_sales_tax_amount,requested_date,requested_time,purchase_source,converted_job_id,payment_pricing_version,payment_pricing_snapshot,payment_funding,quote_options!quote_options_quote_id_fkey(*)").eq("public_token", token).single();
  if (error || !data) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (data.payment_status!=="paid" && data.payment_status!=="pending" && data.expires_at && new Date(`${data.expires_at}T23:59:59`) < new Date()) return NextResponse.json({ error: "This quote has expired" }, { status: 410 });
  if (data.status === "sent") await admin.from("quotes").update({ status: "viewed", updated_at: new Date().toISOString() }).eq("id", data.id);
  const settled=settledQuote(data);
  const {payment_pricing_snapshot: _privateSnapshot,...visible}=settled;
  return NextResponse.json({ ...visible, additional_items: (settled.additional_items || []).map(({ description, quantity, unit_price, taxable }: AdditionalItem) => ({ description, quantity, unit_price, taxable })) }, { headers: { "Cache-Control": "no-store" } });
}
