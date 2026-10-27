type TaxInvoice = {
  TxnTaxDetail?: { TotalTax?: number; TaxLine?: { TaxLineDetail?: { TaxPercent?: number; NetAmountTaxable?: number } }[] };
  Line?: { Amount?: number; SalesItemLineDetail?: { TaxCodeRef?: { value?: string } } }[];
};
// The NY tire fee and other NON lines must not dilute the saved sales-tax rate.
export function quickBooksInvoiceTaxRate(invoice: TaxInvoice, fallbackLines: TaxInvoice["Line"] = []) {
  const tax = Number(invoice.TxnTaxDetail?.TotalTax) || 0;
  if (!tax) return 0;
  const details = invoice.TxnTaxDetail?.TaxLine?.map(line => line.TaxLineDetail).filter(detail => detail && Number(detail.NetAmountTaxable) > 0) || [];
  if (details.length && details.every(detail => Number.isFinite(Number(detail?.TaxPercent)) && Number(detail?.NetAmountTaxable) === Number(details[0]?.NetAmountTaxable))) {
    return Number(details.reduce((sum, detail) => sum + Number(detail?.TaxPercent), 0).toFixed(5));
  }
  const taxable = (invoice.Line || fallbackLines || []).reduce((sum, line) => sum + (line.SalesItemLineDetail?.TaxCodeRef?.value === "TAX" ? Number(line.Amount) || 0 : 0), 0);
  return taxable > 0 ? Number((tax / taxable * 100).toFixed(3)) : 0;
}
