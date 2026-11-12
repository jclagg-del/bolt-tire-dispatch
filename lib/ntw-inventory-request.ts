// TBC InventoryService 2.0.0: keep SAP identifiers as strings, including zeros.
export function ntwCustomerId(value: string | undefined) {
  const id = value?.trim();
  if (!id || !/^\d{1,10}$/.test(id)) throw new Error("NTW Ship-to must be a numeric customer ID of up to 10 digits.");
  return id.padStart(10, "0");
}

export type NtwShipToAddress = { name: string; address: string; address2?: string; city: string; state: string; country: string; zipCode: string };

// Shop address supplied by Bolt Tire. Inventory only; never a customer drop-ship.
export function ntwShopAddress(configured?: string): NtwShipToAddress {
  const address = configured ? JSON.parse(configured) : {
    name: "Bolt Tire", address: "912 Upper Mountain Rd", city: "Pine Bush", state: "NY", country: "US", zipCode: "12566",
  };
  if (!address || typeof address !== "object" || Array.isArray(address)) throw new Error("NTW Ship-to address is invalid.");
  const result: Record<string, string> = {};
  for (const field of ["name", "address", "city", "state", "country", "zipCode"]) {
    const value = address[field];
    if (typeof value !== "string" || !value.trim() || value.length > 40) throw new Error("NTW Ship-to address is incomplete or invalid.");
    result[field] = value.trim();
  }
  if (typeof address.address2 === "string") result.address2 = address.address2.trim().slice(0, 40);
  return result as NtwShipToAddress;
}

type Size = { width: string; ratio: string; diameter: string };
export type NtwInventorySearch = { tireSize: Size; requestedQty?: number } | { partNo: string; brandName: string; requestedQty?: number };
export function ntwInventoryBody(customerId: string, address: NtwShipToAddress, search: NtwInventorySearch) {
  const requestedQty = search.requestedQty ?? 4;
  if (!Number.isInteger(requestedQty) || requestedQty < 1) throw new Error("NTW quantity must be a positive integer.");
  const bySize = "tireSize" in search;
  if (!bySize && (!search.partNo.trim() || !search.brandName.trim())) throw new Error("NTW part-number searches require the tire brand and part number.");
  return {
    customerId: ntwCustomerId(customerId), isDropShip: false,
    shipTo: [{ address }], customerType: "external",
    searchType: bySize ? "ByTireSize" : "ByProductId", source: "Bolt Tire",
    criteria: [bySize ? { tireSize: search.tireSize, requestedQty } : { partNo: search.partNo.trim(), brandName: search.brandName.trim(), requestedQty }],
  };
}

export function ntwErrorDetail(payload: unknown, secrets: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const body = payload as Record<string, unknown>;
  const nested = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
  const candidate = [body.errorMsg, body.errorMessage, body.message, body.detail, nested.message, body.error, body.errorDesc].find(value => typeof value === "string" && value.trim());
  if (typeof candidate !== "string") return "";
  let safe = candidate;
  for (const secret of secrets.filter(Boolean)) safe = safe.split(secret).join("[redacted]");
  return safe.replace(/https?:\/\/\S+/gi, "[URL omitted]").replace(/<[^>]*>/g, "").replace(/[A-Za-z0-9_+=/-]{24,}/g, "[identifier omitted]").replace(/[\r\n\t]+/g, " ").slice(0, 350);
}
