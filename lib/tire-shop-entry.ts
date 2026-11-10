// Navigation only: opening the shop never saves a job or purchases a tire.
export function tireShopSizeLink(size: string | null | undefined, quantity?: string | number | null): string | null {
  const value = (size || "").trim();
  if (!value || value.length > 160) return null;
  const params = new URLSearchParams({ size: value, source: "order" });
  const count = Number(quantity);
  if (Number.isInteger(count) && count >= 1 && count <= 24) params.set("quantity", String(count));
  return `/tire-shop?${params}`;
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
