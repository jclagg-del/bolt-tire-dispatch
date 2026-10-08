export type TaxPeriod = { label: string; start: string; end: string };
export type TaxReportRow = { id: string; source: string; reference: string; customer: string; paidDate: string; totalCents: number; taxCents: number; note: string; href: string };
type RecordRow = Record<string, any>;
const isoDate = (year: number, month: number, day = 1) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
export function taxPeriods(year: number): TaxPeriod[] {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Choose a valid reporting year.");
  return Array.from({ length: 4 }, (_, i) => {
    const month = i * 3 + 2;
    return { label: `Q${i + 1}`, start: isoDate(year, month), end: isoDate(year, month + 3) };
  });
}
export function nyPaymentDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  // Date-only / local stored timestamps are already local calendar dates.
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(value)) {
    const date = value.slice(0, 10);
    const parsed = new Date(`${date}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}
const amount = (value: unknown): number | null => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Math.round(Number(value) * 100);
export function quarterlyTaxReport(quotes: RecordRow[], jobs: RecordRow[], year: number) {
  const periods = taxPeriods(year), rows: TaxReportRow[] = [], issues: { reference: string; reason: string; href: string }[] = [];
  const seen = new Set<string>(), quoteIds = new Set(quotes.map(q => String(q.id)));
  const convertedJobs = new Set(quotes.filter(q => q.converted_job_id != null).map(q => String(q.converted_job_id)));
  const add = (record: RecordRow, isQuote: boolean) => {
    const reference = isQuote ? `Quote #${record.quote_number}` : `Job ${record.id}${record.invoice_number ? ` / Invoice ${record.invoice_number}` : ""}`;
    const href = isQuote ? `/quotes/${record.id}` : `/jobs/${record.id}`;
    const date = nyPaymentDate(isQuote ? record.paid_at : record.paid_date);
    if (date && (date < periods[0].start || date >= periods[3].end)) return;
    if (record.payment_status !== "paid") {
      if (["partial", "refunded"].includes(record.payment_status)) issues.push({ reference, href, reason: "Partial payment or refund: reconcile tax and payment dates separately; excluded from totals." });
      return;
    }
    if (!date) { issues.push({ reference, href, reason: "Missing or invalid paid date; excluded rather than guessing a quarter." }); return; }
    const totalCents = amount(isQuote ? record.amount_paid : record.job_total);
    const taxCents = amount(isQuote ? record.stripe_sales_tax_amount : record.sales_tax_amount);
    if (totalCents === null || taxCents === null || totalCents === 0 || taxCents > totalCents) { issues.push({ reference, href, reason: "Missing or inconsistent recorded payment/tax amount; excluded from totals." }); return; }
    const paymentKey = isQuote ? `stripe:${record.stripe_payment_intent_id || record.stripe_checkout_session_id || record.id}` : record.quickbooks_invoice_id ? `qbo:${record.quickbooks_invoice_id}` : `job:${record.id}`;
    if (seen.has(paymentKey)) { issues.push({ reference, href, reason: "Duplicate payment/invoice reference; counted only once." }); return; }
    seen.add(paymentKey);
    let note = isQuote ? "Saved Stripe payment tax" : record.quickbooks_invoice_id ? "Recorded QuickBooks tax; paid date may be sync date—verify against QuickBooks." : "Recorded job tax and marked-paid date; verify against payment records.";
    if (!isQuote && !record.tax_exempt && taxCents === 0) note += " No tax recorded; review exemption/rate.";
    rows.push({ id: `${isQuote ? 'quote' : 'job'}:${record.id}`, source: isQuote ? "Stripe" : record.quickbooks_invoice_id ? "QuickBooks (recorded)" : "Job (recorded)", reference, customer: record.customer || "", paidDate: date, totalCents, taxCents, note, href });
  };
  quotes.forEach(q => add(q, true));
  for (const job of jobs) {
    // Paid online purchases already appear as quotes, including organization
    // purchases awaiting conversion. Never also count their copied job amounts.
    if (convertedJobs.has(String(job.id)) || (job.source_quote_id && quoteIds.has(String(job.source_quote_id)))) continue;
    if (job.source_quote_id) { issues.push({ reference: `Job ${job.id}`, href: `/jobs/${job.id}`, reason: "Linked online quote is not a paid record; reconcile before including this copied payment." }); continue; }
    add(job, false);
  }
  rows.sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.id.localeCompare(b.id));
  return { year, periods: periods.map(period => {
    const entries = rows.filter(row => row.paidDate >= period.start && row.paidDate < period.end);
    return { ...period, count: entries.length, taxCents: entries.reduce((sum, row) => sum + row.taxCents, 0), stripeTaxCents: entries.filter(row => row.source === "Stripe").reduce((sum, row) => sum + row.taxCents, 0), recordedTaxCents: entries.filter(row => row.source !== "Stripe").reduce((sum, row) => sum + row.taxCents, 0), totalCents: entries.reduce((sum, row) => sum + row.totalCents, 0) };
  }), rows, issues };
}
export type QuarterlyTaxReport = ReturnType<typeof quarterlyTaxReport>;
export function taxReportCsv(report: QuarterlyTaxReport, quarter: number) {
  const period = report.periods[quarter];
  if (!period) throw new Error("Choose a quarter.");
  const cell = (value: unknown) => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, match => `'${match}`).replace(/"/g, '""')}"`;
  const data = [
    ["Report", `NY filing ${period.label}`, "Start (inclusive)", period.start, "End (exclusive)", period.end],
    ["Basis", "Recorded fully paid amounts; not a filed return. Refunds, partial payments and missing records require reconciliation."],
    ["Recorded tax total", (period.taxCents / 100).toFixed(2), "Stripe tax", (period.stripeTaxCents / 100).toFixed(2), "Other recorded tax", (period.recordedTaxCents / 100).toFixed(2)],
    ["Paid date (New York)", "Reference", "Customer", "Source", "Payment total", "Sales tax", "Notes"],
    ...report.rows.filter(row => row.paidDate >= period.start && row.paidDate < period.end).map(row => [row.paidDate, row.reference, row.customer, row.source, (row.totalCents / 100).toFixed(2), (row.taxCents / 100).toFixed(2), row.note]),
    [], ["Review items (reporting year or unknown date)", "Reason"], ...report.issues.map(issue => [issue.reference, issue.reason]),
  ];
  return data.map(row => row.map(cell).join(",")).join("\r\n");
}
