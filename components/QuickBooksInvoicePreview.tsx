"use client";

export type QuickBooksInvoice = {
  Id: string; DocNumber?: string; TxnDate?: string; TotalAmt: number; Balance: number; EmailStatus?: string;
  CustomerRef?: { name?: string }; ShipAddr?: { Line1?: string; City?: string; CountrySubDivisionCode?: string; PostalCode?: string };
  TxnTaxDetail?: { TotalTax?: number };
  Line?: { Id?: string; Description?: string; Amount: number; DetailType: string;
    SalesItemLineDetail?: { Qty?: number; UnitPrice?: number; ItemRef?: { name?: string }; TaxCodeRef?: { value?: string } } }[];
};
export default function QuickBooksInvoicePreview({ invoice, onClose }: { invoice: QuickBooksInvoice; onClose: () => void }) {
  const money = (value = 0) => `$${Number(value).toFixed(2)}`;
  const lines = invoice.Line?.filter(line => line.DetailType === "SalesItemLineDetail") || [];
  return <div role="dialog" aria-modal="true" aria-label="QuickBooks invoice preview" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#0f172a88", padding: 20, display: "grid", placeItems: "center" }}>
    <section style={{ background: "white", padding: 24, borderRadius: 16, maxWidth: 780, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
      <h2>QuickBooks invoice #{invoice.DocNumber || invoice.Id}</h2>
      <p>Read directly from QuickBooks. Viewing does not send the invoice or change payments.</p>
      <p>{invoice.CustomerRef?.name}<br />Invoice date: {invoice.TxnDate}<br />Email status: {invoice.EmailStatus || "Not provided"}</p>
      {invoice.ShipAddr && <p>Service address: {[invoice.ShipAddr.Line1, invoice.ShipAddr.City, invoice.ShipAddr.CountrySubDivisionCode, invoice.ShipAddr.PostalCode].filter(Boolean).join(" · ")}</p>}
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead><tr><th>Item / description</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>Amount</th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={line.Id || index}>
          <td style={{ padding: "12px 8px 12px 0", borderBottom: "1px solid #e2e8f0" }}><strong>{line.SalesItemLineDetail?.ItemRef?.name}</strong><br />{line.Description}</td>
          <td>{line.SalesItemLineDetail?.Qty ?? "—"}</td><td>{line.SalesItemLineDetail?.UnitPrice == null ? "—" : money(line.SalesItemLineDetail.UnitPrice)}</td>
          <td>{line.SalesItemLineDetail?.TaxCodeRef?.value === "TAX" ? "Yes" : line.SalesItemLineDetail?.TaxCodeRef?.value === "NON" ? "No" : "See QuickBooks"}</td><td>{money(line.Amount)}</td>
        </tr>)}</tbody>
      </table></div>
      <p>Subtotal: {money(Number(invoice.TotalAmt) - Number(invoice.TxnTaxDetail?.TotalTax || 0))}<br />Sales tax: {money(invoice.TxnTaxDetail?.TotalTax)}<br /><strong>Total: {money(invoice.TotalAmt)}</strong><br />Unpaid balance: {money(invoice.Balance)}</p>
      <button type="button" onClick={onClose} style={{ padding: "12px 22px" }}>Close invoice preview</button>
    </section>
  </div>;
}
