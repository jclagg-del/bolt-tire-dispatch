import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { quickBooksRequest } from "@/lib/quickbooks";

export async function POST(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: jobs, error } = await admin.from("jobs").select("id,quickbooks_invoice_id").not("quickbooks_invoice_id", "is", null);
    if (error) throw error;
    let updated = 0;
    for (const job of jobs || []) {
      const result = await quickBooksRequest(`/invoice/${job.quickbooks_invoice_id}`);
      const invoice = result.Invoice;
      const balance = Number(invoice.Balance) || 0;
      const total = Number(invoice.TotalAmt) || 0;
      const tax = Number(invoice.TxnTaxDetail?.TotalTax) || 0;
      const { error: updateError } = await admin.from("jobs").update({
        invoice_number: invoice.DocNumber || invoice.Id,
        quickbooks_balance: balance,
        quickbooks_synced_at: new Date().toISOString(),
        job_total: total,
        sales_tax_amount: tax,
        payment_status: balance === 0 ? "paid" : balance < total ? "partial" : "unpaid",
        job_status: balance === 0 ? "paid" : "billed",
      }).eq("id", job.id);
      if (updateError) throw updateError;
      updated += 1;
    }
    return NextResponse.json({ updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "QuickBooks sync failed." }, { status: 500 });
  }
}
