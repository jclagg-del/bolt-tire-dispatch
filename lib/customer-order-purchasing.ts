import { createHash } from "node:crypto";

// Stable across browsers and retries: one purchasing submission per request.
export function purchasingRequestId(orderId: number) {
  const hex = createHash("sha256").update(`customer-order-purchase:${orderId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function array(value: unknown): Json[] { return Array.isArray(value) ? value.map(object) : []; }

export function deliveryDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/^0001-/.test(value)) return null;
  // Calendar dates must not shift backwards when displayed in Eastern time.
  const plain = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T00:00:00(?:\.000)?$)/)?.[1];
  if (plain) return Number.isNaN(Date.parse(plain)) ? null : plain;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(parsed);
  const get = (key: string) => parts.find(part => part.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function supplierOrderDetails(response: unknown) {
  const root = object(response);
  const order = Object.keys(object(root.order)).length ? object(root.order) : root;
  const fulfillments = array(order.orderlines).flatMap(line => array(line.fulfillments));
  const shipments = (fulfillments.length ? fulfillments : array(order.fulfillments)).map(item => ({
    quantity: Number(item.quantity || 0),
    warehouse: String(item.sourcedcname || ""),
    status: String(item.status || ""),
    deliveryDate: deliveryDate(item.estimateddelivery || item.expecteddelivery || item.deliverydate),
    shipMethod: String(item.shipmethod || ""),
  }));
  const dates = shipments.map(item => item.deliveryDate).filter((date): date is string => Boolean(date)).sort();
  return {
    supplier: root.supplier === "U.S. AutoForce" ? "U.S. AutoForce" : "ATD",
    confirmation: String(order.confirmationnumber || root.confirmationnumber || ""),
    total: order.ordertotal == null ? null : Number(order.ordertotal),
    // A job needs all tires; don't promise the earliest date in a split shipment.
    deliveryDate: shipments.length && dates.length === shipments.length ? dates[dates.length - 1] : null,
    shipments,
    message: String(order.thresholdmessage || ""),
  };
}

export function matchesProductNumber(requested: string, product: { atdProductNumber: string; manufacturerProductNumber?: string }) {
  const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const key = normalize(requested);
  return Boolean(key) && [product.atdProductNumber, product.manufacturerProductNumber || ""].some(value => normalize(value) === key);
}
