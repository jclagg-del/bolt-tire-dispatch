export type AdditionalItem = {
  description: string;
  quantity: number;
  unit_price: number;
  taxable: boolean;
  quickbooks_item_id?: string;
  quickbooks_item_name?: string;
  quickbooks_company_id?: string;
};

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const additionalItemAmount = (item: AdditionalItem) => money(Number(item.quantity) * Number(item.unit_price));
export function additionalItemsTotals(items: AdditionalItem[] = []) {
  return items.reduce((sum, item) => {
    const amount = additionalItemAmount(item);
    return { total: money(sum.total + amount), taxable: money(sum.taxable + (item.taxable ? amount : 0)), nonTaxable: money(sum.nonTaxable + (item.taxable ? 0 : amount)) };
  }, { total: 0, taxable: 0, nonTaxable: 0 });
}
export function additionalItemsError(items: unknown): string | null {
  if (!Array.isArray(items) || items.length > 50) return "Use no more than 50 additional items.";
  for (const [index, item] of items.entries()) {
    if (!item || typeof item.description !== "string" || !item.description.trim() || item.description.length > 500) return `Enter a description for additional item ${index + 1} (up to 500 characters).`;
    if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 10000) return `Enter a quantity greater than zero for additional item ${index + 1}.`;
    if (typeof item.unit_price !== "number" || !Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price > 1000000 || money(item.unit_price) !== item.unit_price) return `Enter a valid price with at most two decimal places for additional item ${index + 1}.`;
    if (typeof item.taxable !== "boolean") return `Choose the tax status for additional item ${index + 1}.`;
    for (const field of ["quickbooks_item_id", "quickbooks_item_name", "quickbooks_company_id"]) {
      if (item[field] !== undefined && (typeof item[field] !== "string" || item[field].length > 500)) return "Invalid QuickBooks item mapping.";
    }
  }
  return null;
}

export type QuickBooksItem = { id: string; name: string; description: string; unit_price: number; taxable: boolean; company_id: string };
export function additionalInvoiceLines(items: AdditionalItem[], catalog: QuickBooksItem[], taxExempt: boolean, serviceDate?: string | null) {
  const error = additionalItemsError(items);
  if (error) throw new Error(error);
  return items.map(item => {
    const product = catalog.find(product => product.id === item.quickbooks_item_id && product.company_id === item.quickbooks_company_id);
    if (!product) throw new Error(`Map “${item.description}” to an active QuickBooks product/service on the job before invoicing.`);
    return {
      Amount: additionalItemAmount(item), Description: item.description, DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: {
        ItemRef: { value: product.id, name: product.name }, Qty: item.quantity, UnitPrice: item.unit_price,
        TaxCodeRef: { value: !taxExempt && item.taxable ? "TAX" : "NON" },
        ...(serviceDate ? { ServiceDate: serviceDate } : {}),
      },
    };
  });
}
