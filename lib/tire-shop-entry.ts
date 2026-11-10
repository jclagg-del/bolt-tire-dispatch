// Navigation only: opening the shop never saves a job or purchases a tire.
export type TireShopSource = { jobId: string | number; orderId?: never } | { orderId: string | number; jobId?: never };
export function tireShopSizeLink(size: string | null | undefined, quantity?: string | number | null, source?: TireShopSource): string | null {
  const value = (size || "").trim();
  if (!value || value.length > 160) return null;
  const params = new URLSearchParams({ size: value, source: "order" });
  const count = Number(quantity);
  if (Number.isInteger(count) && count >= 1 && count <= 24) params.set("quantity", String(count));
  if (source?.jobId != null) params.set("jobId", String(source.jobId));
  if (source?.orderId != null) params.set("orderId", String(source.orderId));
  return `/tire-shop?${params}`;
}

export function tireShopSource(search: string): TireShopSource | null {
  const params = new URLSearchParams(search), jobId = params.get("jobId"), orderId = params.get("orderId");
  if (params.get("quote") || Boolean(jobId) === Boolean(orderId)) return null;
  const id = jobId || orderId || "";
  if (!/^[1-9]\d{0,18}$/.test(id)) return null;
  return jobId ? { jobId: id } : { orderId: id };
}

export function tireShopSizeEntry(search: string) {
  const params = new URLSearchParams(search);
  // Quote editing takes precedence and keeps its existing saved selections.
  if (params.get("quote")) return null;
  const size = (params.get("size") || "").trim();
  if (!size || size.length > 160) return null;
  const count = Number(params.get("quantity"));
  return { size, quantity: Number.isInteger(count) && count >= 1 && count <= 24 ? count : 4, fromOrder: params.get("source") === "order" };
}
