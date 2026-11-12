import "server-only";
import { request as httpsRequest } from "node:https";
import { ntwCustomerId, ntwShopAddress, ntwInventoryBody, ntwErrorDetail } from "./ntw-inventory-request";

// Temporary diagnostic: deliberately independent of the live catalog adapter.
const endpoint = "https://tbcservicesqa.tbccorp.com/tbccorp/qa/tbc/api/v2/products/tires";
export class NtwTestError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export function testSize(value: unknown) {
  if (typeof value !== "string" || value.length > 30) throw new NtwTestError("Enter a tire size such as 205/75R15.", 400);
  const match = value.trim().toUpperCase().replace(/\s/g, "").match(/^(?:LT|P)?(\d{3})\/?(\d{2})(?:ZR|R)?(\d{2})$/);
  if (!match) throw new NtwTestError("Use a metric tire size such as 205/75R15 or LT245/75R16.", 400);
  return { width: match[1], ratio: match[2], diameter: match[3] };
}
type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).slice(0, 240) : "";
const number = (value: unknown) => value !== null && value !== "" && ["string", "number"].includes(typeof value) && Number.isFinite(Number(value)) ? Number(value) : null;
export function ntwTestFailureDetail(payload: unknown, secrets: string[]) {
  return ntwErrorDetail(payload, secrets);
}
export function summarizeNtwTest(payload: unknown) {
  const body = record(payload);
  if (!Array.isArray(body.product)) throw new NtwTestError("NTW responded, but did not return the expected product list. The connection is not verified yet.");
  return { count: body.product.length, products: body.product.slice(0, 25).map(value => {
    const row = record(value), cost = record(row.productCost);
    return {
      partNumber: text(row.partNo), brand: text(row.brandName), model: text(row.modelName || row.description),
      loadSpeed: [text(row.loadIndexRange), text(row.speedRating)].filter(Boolean).join(" "),
      cost: number(cost.amount), currency: text(cost.currencyCode) || "USD", quantity: number(row.estimatedAvailability),
      warehouses: (Array.isArray(row.availableSource) ? row.availableSource : []).slice(0, 30).map(source => {
        const stock = record(source), address = record(stock.address);
        return { location: [text(address.city), text(address.state)].filter(Boolean).join(", ") || text(stock.locationId) || "Location not supplied", quantity: number(stock.quantityAvailable) };
      }),
    };
  }) };
}
export async function runNtwTest(size: unknown) {
  const tireSize = testSize(size);
  const clientId = process.env.NTW_TEST_CLIENT_ID?.trim(), secret = process.env.NTW_TEST_CLIENT_SECRET?.trim();
  if (!clientId || !secret || !process.env.NTW_TEST_CUSTOMER_ID) throw new NtwTestError("The isolated NTW test credentials or Ship-to number are not configured yet.", 503);
  const customerId = ntwCustomerId(process.env.NTW_TEST_CUSTOMER_ID);
  const url = new URL(endpoint);
  // Do not borrow an unverified dealer code from the normal supplier adapter.
  const dealer = process.env.NTW_TEST_DEALER_CODE?.trim();
  if (dealer) url.searchParams.set("dealerCode", dealer);
  const ca = (process.env.NTW_TEST_CA_CERT || process.env.NTW_CA_CERT)?.trim().replace(/\\n/g, "\n");
  const body = JSON.stringify(ntwInventoryBody(customerId, ntwShopAddress(process.env.NTW_TEST_SHIP_TO_ADDRESS_JSON), { tireSize }));
  const started = Date.now();
  const result = await new Promise<unknown>((resolve, reject) => {
    const request = httpsRequest(url, { method: "POST", ca, allowPartialTrustChain: Boolean(ca), headers: { Accept: "application/json", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body).toString(), "X-IBM-Client-Id": clientId, "X-IBM-Client-Secret": secret } }, response => {
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", chunk => { bytes += chunk.length; if (bytes > 5_000_000) { response.destroy(); reject(new NtwTestError("NTW returned an oversized response.")); } else chunks.push(Buffer.from(chunk)); });
      response.on("error", () => reject(new NtwTestError("The NTW response was interrupted. Please retry.")));
      response.on("end", () => {
        const status = response.statusCode || 502;
        if (status < 200 || status >= 300) {
          let detail = "";
          try { detail = ntwTestFailureDetail(JSON.parse(Buffer.concat(chunks).toString("utf8")), [clientId, secret, customerId]); } catch { /* Never echo HTML error pages. */ }
          reject(new NtwTestError(`NTW returned HTTP ${status}. ${detail || (status === 401 || status === 403 ? "Check the QA subscription, API keys and Ship-to access." : "The inventory lookup was not successful.")}`)); return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new NtwTestError("NTW returned an unreadable response.")); }
      });
    });
    request.setTimeout(15_000, () => request.destroy(new NtwTestError("NTW did not respond within 15 seconds.")));
    request.on("error", error => {
      if (error instanceof NtwTestError) { reject(error); return; }
      const code = (error as NodeJS.ErrnoException).code || "";
      reject(new NtwTestError(/CERT|SSL|VERIFY/.test(code) ? "NTW's TLS certificate could not be verified. No insecure connection was attempted." : "Could not connect to NTW QA. Check connectivity and retry."));
    });
    request.end(body);
  });
  return { environment: "NTW QA — inventory only", size: `${tireSize.width}/${tireSize.ratio}R${tireSize.diameter}`, elapsedMs: Date.now() - started, ...summarizeNtwTest(result) };
}
