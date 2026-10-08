import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { quarterlyTaxReport } from "@/lib/quarterly-tax-report";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const staff = await admin.from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
    if (staff.error || staff.data?.role !== "admin") return NextResponse.json({ error: "Admin access is required for tax reports." }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const year = Number(params.get("year"));
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return NextResponse.json({ error: "Choose a valid reporting year." }, { status: 400 });
    const read = async (table: string, fields: string) => {
      const rows: Record<string, any>[] = [];
      for (let offset = 0; offset < 100000; offset += 500) {
        const { data, error } = await admin.from(table).select(fields).in("payment_status", ["paid", "partial", "refunded"]).order("id").range(offset, offset + 499);
        if (error) throw new Error("Tax records could not be loaded. No partial totals are shown.");
        rows.push(...(data || []));
        if ((data || []).length < 500) return rows;
      }
      throw new Error("Too many records for this report. No partial totals are shown.");
    };
    const [quotes, jobs] = await Promise.all([
      read("quotes", "id,quote_number,customer,payment_status,amount_paid,stripe_sales_tax_amount,paid_at,stripe_payment_intent_id,stripe_checkout_session_id,converted_job_id"),
      read("jobs", "id,customer,payment_status,job_total,sales_tax_amount,paid_date,source_quote_id,invoice_number,quickbooks_invoice_id,tax_exempt"),
    ]);
    return NextResponse.json(quarterlyTaxReport(quotes, jobs, year), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tax report unavailable." }, { status: 500 });
  }
}
