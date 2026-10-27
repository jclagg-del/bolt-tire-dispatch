import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { escapeQueryValue, getConnection, quickBooksRequest } from "@/lib/quickbooks";
import { additionalInvoiceLines } from "@/lib/additional-items";
import { quickBooksItems } from "@/lib/quickbooks-items";
import { quickBooksBaseItems, quickBooksInstallationChoices } from "@/lib/quickbooks-base-items";
import { quickBooksInvoiceTaxRate } from "@/lib/quickbooks-invoice-tax";
import { quickBooksServiceAddress } from "@/lib/quickbooks-address";

// Read the saved invoice directly from QuickBooks; never sync or mutate it here.
export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: staff, error: staffError } = await admin.from("staff_security").select("role,password_change_required").eq("user_id", user.id).maybeSingle();
    if (staffError || !staff || !["admin", "office"].includes(staff.role) || staff.password_change_required) return NextResponse.json({ error: "Office or admin access with completed password setup is required." }, { status: 403 });
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (!jobId || !/^\d+$/.test(jobId)) return NextResponse.json({ error: "A valid job is required." }, { status: 400 });
    const { data: job, error } = await admin.from("jobs").select("quickbooks_invoice_id").eq("id", jobId).single();
    if (error || !job?.quickbooks_invoice_id) return NextResponse.json({ error: "This job has no linked QuickBooks invoice." }, { status: 404 });
    const { Invoice: invoice } = await quickBooksRequest(`/invoice/${encodeURIComponent(job.quickbooks_invoice_id)}`);
    if (!invoice?.Id) throw new Error("QuickBooks did not return the invoice.");
    return NextResponse.json({ invoice }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read invoice." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { jobId, installationItemId } = await request.json();
    const admin = createAdminClient();
    const { data: job, error } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (error || !job) throw new Error("Job not found.");
    if (!job.complete) throw new Error("Complete the job before creating an invoice.");
    if (job.quickbooks_invoice_id) throw new Error("This job already has a QuickBooks invoice.");
    // Validate all mappings before creating any QuickBooks customer or invoice.
    const extraLines = additionalInvoiceLines(job.additional_items || [], job.additional_items?.length ? await quickBooksItems() : [], Boolean(job.tax_exempt), job.scheduled ? String(job.scheduled).slice(0, 10) : null);

    const itemQuery = encodeURIComponent("select * from Item where Active = true maxresults 1000");
    const itemResult = await quickBooksRequest(`/query?query=${itemQuery}`);
    const items = itemResult.QueryResponse?.Item || [];
    let category: string | null = null;
    if (Number(job.installation_cost) > 0 && !quickBooksBaseItems(items, null, Number(job.qty)).installationItem) {
      let source = admin.from("quotes").select("service_category");
      source = job.source_quote_id ? source.eq("id", job.source_quote_id) : source.eq("converted_job_id", job.id);
      const quote = await source.maybeSingle();
      if (quote.error) throw new Error("Could not verify this job’s quoted installation category.");
      category = quote.data?.service_category || null;
    }
    const { tireItem, installationItem: defaultInstallationItem, installationName, stateTireFeeItem, disposalItem } = quickBooksBaseItems(items, category, Number(job.qty));
    const installationChoices = quickBooksInstallationChoices(items);
    const selectedInstallationItem = installationItemId == null ? undefined : installationChoices.find(item => item.Id === installationItemId);
    if (installationItemId != null && !selectedInstallationItem) throw new Error("Choose an active QuickBooks installation service from the list.");
    const installationItem = selectedInstallationItem || defaultInstallationItem;
    if (Number(job.installation_cost) > 0 && !installationItem && installationChoices.length) {
      return NextResponse.json({
        error: "Choose the QuickBooks service for this job’s installation charge. The job’s price will not change.",
        code: "INSTALLATION_ITEM_REQUIRED",
        installationItems: installationChoices.map(item => ({ id: item.Id, name: item.FullyQualifiedName || item.Name })),
      }, { status: 422 });
    }
    const missingItems = [
      Number(job.qty) * Number(job.price_tires) > 0 && !tireItem && "Tires",
      Number(job.installation_cost) > 0 && !installationItem && installationName,
      Number(job.ny_state_tire_fee ?? Number(job.qty) * 2.5) > 0 && !stateTireFeeItem && "NY State Tire Tax / NYS Tire Disposal Fee",
      Number(job.tire_disposal_fee ?? Number(job.qty) * 4) > 0 && !disposalItem && "Waste Tire Fee",
    ].filter(Boolean);
    if (missingItems.length) {
      throw new Error(`Create these as invoiceable products/services—not categories—in QuickBooks: ${missingItems.join(", ")}.`);
    }

    const taxCode = job.tax_exempt ? "NON" : "TAX";
    const serviceDate = job.scheduled ? String(job.scheduled).slice(0, 10) : null;
    const lines: Record<string, unknown>[] = [];
    const addLine = (item: { Id: string; Name: string } | undefined, description: string, amount: number, taxable = true, quantity?: number, unitPrice?: number) => {
      if (amount <= 0) return;
      if (!item) throw new Error(`Missing QuickBooks item for ${description}.`);
      lines.push({
        Amount: Number(amount.toFixed(2)),
        Description: description,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          ...(serviceDate ? { ServiceDate: serviceDate } : {}),
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
    addLine(installationItem, installationDescription, Number(job.installation_cost) || 0, true, 1, Number(job.installation_cost) || 0);
    const stateTireFee = job.ny_state_tire_fee !== null && job.ny_state_tire_fee !== undefined
      ? Number(job.ny_state_tire_fee) || 0
      : qty * 2.5;
    const stateTireFeeUnitPrice = qty > 0 ? stateTireFee / qty : undefined;
    addLine(stateTireFeeItem, "NY State tire tax", stateTireFee, false, qty, stateTireFeeUnitPrice);
    const disposalFee = job.tire_disposal_fee == null ? qty * 4 : Number(job.tire_disposal_fee) || 0;
    const disposalUnitPrice = qty > 0 ? disposalFee / qty : undefined;
    addLine(disposalItem, "Waste tire fee", disposalFee, true, qty, disposalUnitPrice);
    lines.push(...extraLines);
    if (!lines.length) throw new Error("Add tire, installation, or disposal charges before creating an invoice.");

    const shipTo = job.tax_exempt ? (job.address ? { Line1: job.address } : undefined) : quickBooksServiceAddress(String(job.address || ""));
    const connection = await getConnection();
    const company = (await quickBooksRequest(`/companyinfo/${encodeURIComponent(connection.realm_id)}`)).CompanyInfo;
    const origin = company?.CompanyAddr;
    if (!job.tax_exempt && (!origin?.Line1 || !origin?.City || !origin?.CountrySubDivisionCode || !origin?.PostalCode)) throw new Error("Complete the business address in QuickBooks before calculating invoice sales tax.");
    const shipFrom = origin ? { Line1: origin.Line1, ...(origin.Line2 ? { Line2: origin.Line2 } : {}), City: origin.City, CountrySubDivisionCode: origin.CountrySubDivisionCode, PostalCode: origin.PostalCode, Country: origin.Country || "USA" } : undefined;

    // Finish validating charges and item mappings before any QuickBooks writes.
    const customerName = String(job.billing_name || job.customer || "").trim();
    if (!customerName) throw new Error("The job needs a customer or billing name.");
    let customer = null;
    if (job.quickbooks_customer_id) {
      try { customer = (await quickBooksRequest(`/customer/${job.quickbooks_customer_id}`)).Customer; }
      catch { customer = null; }
    }
    if (!customer) {
      const query = encodeURIComponent(`select * from Customer where DisplayName = '${escapeQueryValue(customerName)}' maxresults 1`);
      customer = (await quickBooksRequest(`/query?query=${query}`)).QueryResponse?.Customer?.[0];
    }
    if (!customer) {
      const payload: Record<string, unknown> = { DisplayName: customerName };
      if (job.email) payload.PrimaryEmailAddr = { Address: job.email };
      if (job.phone) payload.PrimaryPhone = { FreeFormNumber: job.phone };
      if (job.address) payload.BillAddr = { Line1: job.address };
      customer = (await quickBooksRequest("/customer", { method: "POST", body: JSON.stringify(payload) })).Customer;
    }

    const invoicePayload: Record<string, unknown> = {
      DocNumber: "AUTO_GENERATE",
      CustomerRef: { value: customer.Id, name: customer.DisplayName },
      Line: lines,
      ...(serviceDate ? { TxnDate: serviceDate } : {}),
      PrivateNote: `Bolt Tire job ${job.id}${job.po_number ? ` • PO ${job.po_number}` : ""}`,
      CustomerMemo: { value: [job.vehicle, job.notes].filter(Boolean).join(" • ").slice(0, 1000) },
      ...(job.email ? { BillEmail: { Address: job.email } } : {}),
      ...(shipTo ? { ShipAddr: shipTo } : {}),
      ...(shipFrom ? { ShipFromAddr: shipFrom } : {}),
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
      quickbooks_balance: invoice.Balance == null ? total : Number(invoice.Balance),
      quickbooks_synced_at: new Date().toISOString(),
      subtotal,
      sales_tax_amount: tax,
      sales_tax_rate: quickBooksInvoiceTaxRate(invoice, lines),
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
      sales_tax_rate: quickBooksInvoiceTaxRate(invoice),
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
