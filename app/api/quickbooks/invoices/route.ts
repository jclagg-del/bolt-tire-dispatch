import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { escapeQueryValue, quickBooksRequest } from "@/lib/quickbooks";

export async function POST(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { jobId } = await request.json();
    const admin = createAdminClient();
    const { data: job, error } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (error || !job) throw new Error("Job not found.");
    if (!job.complete) throw new Error("Complete the job before creating an invoice.");
    if (job.quickbooks_invoice_id) throw new Error("This job already has a QuickBooks invoice.");

    const customerName = String(job.billing_name || job.customer || "").trim();
    if (!customerName) throw new Error("The job needs a customer or billing name.");
    let customer = null;
    if (job.quickbooks_customer_id) {
      try {
        customer = (await quickBooksRequest(`/customer/${job.quickbooks_customer_id}`)).Customer;
      } catch {
        // A customer ID saved during sandbox testing will not exist in the
        // production company. Fall back to matching the customer by name.
        customer = null;
      }
    }
    const customerQuery = encodeURIComponent(`select * from Customer where DisplayName = '${escapeQueryValue(customerName)}' maxresults 1`);
    if (!customer) {
      const customerResult = await quickBooksRequest(`/query?query=${customerQuery}`);
      customer = customerResult.QueryResponse?.Customer?.[0];
    }
    if (!customer) {
      const payload: Record<string, unknown> = { DisplayName: customerName };
      if (job.email) payload.PrimaryEmailAddr = { Address: job.email };
      if (job.phone) payload.PrimaryPhone = { FreeFormNumber: job.phone };
      if (job.address) payload.BillAddr = { Line1: job.address };
      const created = await quickBooksRequest("/customer", { method: "POST", body: JSON.stringify(payload) });
      customer = created.Customer;
    }

    const itemQuery = encodeURIComponent("select * from Item where Active = true maxresults 1000");
    const itemResult = await quickBooksRequest(`/query?query=${itemQuery}`);
    const items = itemResult.QueryResponse?.Item || [];
    const normalizeItemName = (value?: string) => (value || "").trim().toLowerCase();
    const findItem = (name: string) => items.find(
      (item: { Name?: string; FullyQualifiedName?: string; Type?: string }) =>
        item.Type !== "Category" &&
        (normalizeItemName(item.Name) === normalizeItemName(name) ||
          normalizeItemName(item.FullyQualifiedName) === normalizeItemName(name))
    );
    const tireItem = findItem("Tires");
    const installationItem = findItem("On-site Mount and Balance");
    const stateTireFeeItem = findItem("NY State Tire Tax");
    const disposalItem = findItem("Waste Tire Fee");
    const missingItems = [
      !tireItem && "Tires",
      !installationItem && "On-site Mount and Balance",
      !stateTireFeeItem && "NY State Tire Tax",
      !disposalItem && "Waste Tire Fee",
    ].filter(Boolean);
    if (missingItems.length) {
      throw new Error(`Create these as invoiceable products/services—not categories—in QuickBooks: ${missingItems.join(", ")}.`);
    }

    const taxCode = job.tax_exempt ? "NON" : "TAX";
    const lines: Record<string, unknown>[] = [];
    const addLine = (item: { Id: string; Name: string }, description: string, amount: number, taxable = true, quantity?: number, unitPrice?: number) => {
      if (amount <= 0) return;
      lines.push({
        Amount: Number(amount.toFixed(2)),
        Description: description,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          ItemRef: { value: item.Id, name: item.Name },
          TaxCodeRef: { value: taxable ? taxCode : "NON" },
          ...(quantity && unitPrice ? { Qty: quantity, UnitPrice: unitPrice } : {}),
        },
      });
    };

    const qty = Number(job.qty) || 0;
    const tirePrice = Number(job.price_tires) || 0;
    addLine(tireItem, [job.tires, job.size].filter(Boolean).join(" • ") || "Tires", qty * tirePrice, true, qty, tirePrice);
    const installationDescription = [
      "On-site mount and balance",
      job.vehicle,
      job.vehicle_mileage ? `${job.vehicle_mileage} miles` : null,
    ].filter(Boolean).join(" • ");
    addLine(installationItem, installationDescription, Number(job.installation_cost) || 0);
    addLine(stateTireFeeItem, "NY State tire tax", Number(job.ny_state_tire_fee) || qty * 2.5, false, qty, 2.5);
    addLine(disposalItem, "Waste tire fee", Number(job.tire_disposal_fee) || qty * 4, true, qty, 4);
    if (!lines.length) throw new Error("Add tire, installation, or disposal charges before creating an invoice.");

    const invoicePayload: Record<string, unknown> = {
      CustomerRef: { value: customer.Id, name: customer.DisplayName },
      Line: lines,
      PrivateNote: `Bolt Tire job ${job.id}${job.po_number ? ` • PO ${job.po_number}` : ""}`,
      CustomerMemo: { value: [job.vehicle, job.notes].filter(Boolean).join(" • ").slice(0, 1000) },
      ...(job.email ? { BillEmail: { Address: job.email } } : {}),
      ...(job.address ? { ShipAddr: { Line1: job.address } } : {}),
    };

    const created = await quickBooksRequest("/invoice", { method: "POST", body: JSON.stringify(invoicePayload) });
    const invoice = created.Invoice;
    const total = Number(invoice.TotalAmt) || 0;
    const tax = Number(invoice.TxnTaxDetail?.TotalTax) || 0;
    const subtotal = Math.max(0, total - tax);
    const { error: updateError } = await admin.from("jobs").update({
      quickbooks_invoice_id: invoice.Id,
      quickbooks_customer_id: customer.Id,
      invoice_number: invoice.DocNumber || invoice.Id,
      quickbooks_balance: Number(invoice.Balance) || total,
      quickbooks_synced_at: new Date().toISOString(),
      subtotal,
      sales_tax_amount: tax,
      sales_tax_rate: subtotal ? (tax / subtotal) * 100 : 0,
      job_total: total,
      payment_status: Number(invoice.Balance) === 0 ? "paid" : "unpaid",
      job_status: Number(invoice.Balance) === 0 ? "paid" : "billed",
    }).eq("id", job.id);
    if (updateError) throw updateError;
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invoice creation failed." }, { status: 500 });
  }
}
