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
    const serviceDate = job.scheduled ? String(job.scheduled).slice(0, 10) : null;
    const lines: Record<string, unknown>[] = [];
    const addLine = (item: { Id: string; Name: string }, description: string, amount: number, taxable = true, quantity?: number, unitPrice?: number) => {
      if (amount <= 0) return;
      lines.push({
        Amount: Number(amount.toFixed(2)),
        Description: description,
        DetailType: "SalesItemLineDetail",
        ...(serviceDate ? { ServiceDate: serviceDate } : {}),
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
      ...(serviceDate ? { TxnDate: serviceDate } : {}),
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
      paid_date: Number(invoice.Balance) === 0 ? new Date().toISOString() : null,
    }).eq("id", job.id);
    if (updateError) throw updateError;
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invoice creation failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { jobId, docNumber: rawDocNumber } = await request.json();
    const docNumber = String(rawDocNumber || "").trim();
    if (!/^\d+$/.test(docNumber)) {
      return NextResponse.json({ error: "Enter a numeric invoice number." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("id,quickbooks_invoice_id")
      .eq("id", jobId)
      .single();
    if (jobError || !job?.quickbooks_invoice_id) {
      return NextResponse.json({ error: "This job is not linked to a QuickBooks invoice." }, { status: 404 });
    }

    const duplicateQuery = encodeURIComponent(
      `select * from Invoice where DocNumber = '${escapeQueryValue(docNumber)}' maxresults 1`
    );
    const duplicateResult = await quickBooksRequest(`/query?query=${duplicateQuery}`);
    const duplicate = duplicateResult.QueryResponse?.Invoice?.[0];
    if (duplicate && String(duplicate.Id) !== String(job.quickbooks_invoice_id)) {
      return NextResponse.json({ error: `Invoice number ${docNumber} is already in use.` }, { status: 409 });
    }

    const current = (await quickBooksRequest(`/invoice/${job.quickbooks_invoice_id}`)).Invoice;
    const updated = await quickBooksRequest("/invoice?operation=update", {
      method: "POST",
      body: JSON.stringify({
        Id: current.Id,
        SyncToken: current.SyncToken,
        sparse: true,
        DocNumber: docNumber,
      }),
    });
    const invoice = updated.Invoice;
    const { error: updateError } = await admin.from("jobs").update({
      invoice_number: invoice.DocNumber,
      quickbooks_synced_at: new Date().toISOString(),
    }).eq("id", job.id);
    if (updateError) throw updateError;
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invoice number update failed." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { jobId, docNumber: rawDocNumber } = await request.json();
    const docNumber = String(rawDocNumber || "").trim();
    if (!/^\d+$/.test(docNumber)) {
      return NextResponse.json({ error: "Enter a numeric invoice number." }, { status: 400 });
    }

    const query = encodeURIComponent(
      `select * from Invoice where DocNumber = '${escapeQueryValue(docNumber)}' maxresults 2`
    );
    const result = await quickBooksRequest(`/query?query=${query}`);
    const matches = result.QueryResponse?.Invoice || [];
    if (matches.length === 0) {
      return NextResponse.json({ error: `QuickBooks invoice ${docNumber} was not found.` }, { status: 404 });
    }
    if (matches.length > 1) {
      return NextResponse.json({ error: `QuickBooks has more than one invoice numbered ${docNumber}. Resolve the duplicate in QuickBooks first.` }, { status: 409 });
    }

    const invoice = matches[0];
    const total = Number(invoice.TotalAmt) || 0;
    const tax = Number(invoice.TxnTaxDetail?.TotalTax) || 0;
    const balance = Number(invoice.Balance) || 0;
    const subtotal = Math.max(0, total - tax);
    const admin = createAdminClient();
    const { error: updateError } = await admin.from("jobs").update({
      quickbooks_invoice_id: invoice.Id,
      invoice_number: invoice.DocNumber,
      quickbooks_balance: balance,
      quickbooks_synced_at: new Date().toISOString(),
      subtotal,
      sales_tax_amount: tax,
      sales_tax_rate: subtotal ? (tax / subtotal) * 100 : 0,
      job_total: total,
      payment_status: balance === 0 ? "paid" : balance < total ? "partial" : "unpaid",
      job_status: balance === 0 ? "paid" : "billed",
      paid_date: balance === 0 ? new Date().toISOString() : null,
    }).eq("id", jobId);
    if (updateError) throw updateError;
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invoice relinking failed." }, { status: 500 });
  }
}
