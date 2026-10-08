"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { nyPaymentDate, taxReportCsv, type QuarterlyTaxReport as Report } from "@/lib/quarterly-tax-report";
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const endLabel = (end: string) => dateLabel(new Date(new Date(`${end}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10));
export default function QuarterlyTaxReport() {
  const today = nyPaymentDate(new Date().toISOString())!;
  const month = Number(today.slice(5, 7)), currentYear = Number(today.slice(0, 4)) - (month < 3 ? 1 : 0);
  const [year, setYear] = useState(currentYear), [quarter, setQuarter] = useState(Math.floor(((month + 9) % 12) / 3));
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let canceled = false;
    setReport(null); setError("");
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const response = await fetch(`/api/reports/taxes?year=${year}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ""}` }, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Tax report unavailable.");
        if (!canceled) setReport(result);
      } catch (reason) { if (!canceled) setError(reason instanceof Error ? reason.message : "Tax report unavailable."); }
    })();
    return () => { canceled = true; };
  }, [year, refresh]);
  const period = report?.periods[quarter];
  const entries = report?.rows.filter(row => period && row.paidDate >= period.start && row.paidDate < period.end) || [];
  function download() {
    if (!report || !period) return;
    const url = URL.createObjectURL(new Blob(["\uFEFF", taxReportCsv(report, quarter)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `bolt-tire-ny-tax-${period.start}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <section style={{ background: "white", border: "1px solid #dce3ef", borderRadius: 16, padding: 22, marginBottom: 24 }} aria-label="NY quarterly tax report">
    <h2 style={{ marginTop: 0 }}>NY quarterly sales tax</h2>
    <p>Recorded tax on fully paid orders and jobs, grouped by New York filing periods. Online quotes are counted once, not again when converted to jobs.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <label>Reporting year <select aria-label="Tax reporting year" value={year} onChange={event => setYear(Number(event.target.value))} style={{ padding: 10 }}>
        {Array.from({ length: Math.max(1, currentYear - 2019) }, (_, i) => currentYear - i).map(y => <option key={y} value={y}>Mar {y} – Feb {y + 1}</option>)}
      </select></label>
      <button onClick={() => setRefresh(value => value + 1)} style={{ padding: 10 }}>Refresh totals</button>
      <button onClick={download} disabled={!report} style={{ padding: 10 }}>Download quarter CSV</button>
    </div>
    {error ? <p role="alert">{error}</p> : !report ? <p role="status">Loading tax records…</p> : <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, margin: "20px 0" }}>
        {report.periods.map((p, i) => <button key={p.start} aria-pressed={quarter === i} onClick={() => setQuarter(i)} style={{ textAlign: "left", padding: 16, borderRadius: 12, border: `2px solid ${quarter === i ? '#285cff' : '#dce3ef'}`, background: quarter === i ? '#f1f5ff' : '#fff' }}>
          <strong>{p.label} · {dateLabel(p.start)} – {endLabel(p.end)}</strong><span style={{ display: "block", fontSize: 26, fontWeight: 800, margin: "8px 0" }}>{money(p.taxCents)}</span>
          <span>{p.count} paid records</span>
        </button>)}
      </div>
      {period && <p><strong>Recorded sales tax: {money(period.taxCents)}</strong> · Stripe: {money(period.stripeTaxCents)} · Other recorded tax: {money(period.recordedTaxCents)}</p>}
      <p style={{ color: "#64748b", fontSize: 13 }}>Sales tax only—not disposal or NY tire fees. This is a collection tracker, not a tax return or amount due. QuickBooks paid dates may reflect when a payment was synced. Refund adjustments and partial payments require reconciliation with Stripe / QuickBooks; no refund is silently deducted. Historical job values can change when edited or synced. Other states, jurisdictions and filing obligations must be reconciled separately.</p>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead><tr>{['Paid date (NY)', 'Order / job', 'Customer', 'Source', 'Payment', 'Sales tax'].map(text => <th key={text} style={{ padding: 10, borderBottom: "1px solid #dce3ef" }}>{text}</th>)}</tr></thead>
        <tbody>{entries.map(row => <tr key={row.id}><td style={{ padding: 10 }}>{dateLabel(row.paidDate)}</td><td><a href={row.href}>{row.reference}</a></td><td>{row.customer}</td><td title={row.note}>{row.source}</td><td>{money(row.totalCents)}</td><td>{money(row.taxCents)}</td></tr>)}</tbody>
      </table></div>
      {!entries.length && <p>No recorded paid tax entries for this quarter.</p>}
      {!!report.issues.length && <details style={{ marginTop: 16 }}><summary>{report.issues.length} records need review (reporting year or unknown paid date)</summary><ul>{report.issues.map((issue, i) => <li key={i}><a href={issue.href}>{issue.reference}</a>: {issue.reason}</li>)}</ul></details>}
    </>}
    <small><a href="https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/filing_requirements_for_sales_and_use_tax_returns.htm" target="_blank" rel="noopener noreferrer">NY sales-tax filing periods</a></small>
  </section>;
}
