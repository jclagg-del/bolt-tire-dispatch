import { getConnection, quickBooksConfig, quickBooksRequest } from "@/lib/quickbooks";

/** Read-only API checks: never create invoices, customers, or sync job balances. */
export async function quickBooksHealth(fullTest = false) {
  const environment = quickBooksConfig().environment;
  const connection = await getConnection();
  const result = await quickBooksRequest(`/companyinfo/${encodeURIComponent(connection.realm_id)}`);
  if (!result.CompanyInfo?.Id || !(result.CompanyInfo.CompanyName || result.CompanyInfo.LegalName)) {
    throw new Error("QuickBooks did not return the connected company. Please test again or reconnect.");
  }
  const checks: { name: string; ok: boolean; error?: string }[] = [{ name: "Company connection", ok: true }];
  if (fullTest) {
    for (const [entity, name] of [["Customer", "Customer lookup"], ["Invoice", "Invoice / payment reads"], ["Item", "Products / services"]]) {
      try {
        const data = await quickBooksRequest(`/query?query=${encodeURIComponent(`select * from ${entity} maxresults 1`)}`);
        if (!data.QueryResponse || typeof data.QueryResponse !== "object") throw new Error("QuickBooks returned an unexpected response.");
        checks.push({ name, ok: true });
      } catch (error) {
        checks.push({ name, ok: false, error: error instanceof Error ? error.message : "Check failed. Try again." });
      }
    }
  }
  return { connected: true, healthy: checks.every(check => check.ok), environment,
    companyName: String(result.CompanyInfo.CompanyName || result.CompanyInfo.LegalName || "QuickBooks company"),
    checkedAt: new Date().toISOString(), checks };
}
