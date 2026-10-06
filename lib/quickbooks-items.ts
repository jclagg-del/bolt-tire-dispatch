import "server-only";
import { getConnection, quickBooksRequest } from "@/lib/quickbooks";
import { QuickBooksItem } from "@/lib/additional-items";

export async function quickBooksItems(): Promise<QuickBooksItem[]> {
  const connection = await getConnection();
  if (!connection) throw new Error("Connect QuickBooks in Settings to choose invoice items.");
  const items: QuickBooksItem[] = [];
  for (let start = 1; ; start += 1000) {
    const query = encodeURIComponent(`select * from Item where Active = true startposition ${start} maxresults 1000`);
    const result = await quickBooksRequest(`/query?query=${query}`);
    const batch = result.QueryResponse?.Item || [];
    for (const item of batch) {
      if (!["Service", "NonInventory", "Inventory"].includes(item.Type)) continue;
      items.push({ id: String(item.Id), name: item.FullyQualifiedName || item.Name, description: item.Description || item.Name,
        unit_price: Number(item.UnitPrice) || 0, taxable: item.Taxable !== false, company_id: connection.realm_id });
    }
    if (batch.length < 1000) break;
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}
