import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type UsafPurchaseInput = { part: string; quantity: number; po: string; mo: string; lineCode: string; branch: string; mode: "test" | "production" };
export type UsafSignedPreview = UsafPurchaseInput & { userId: string; expiresAt: number; total: number; deliveryDate: string | null };

export function validateUsafPurchase(value: Record<string, unknown>): UsafPurchaseInput {
  const { mode, quantity } = value;
  if (mode !== "test" && mode !== "production") throw new Error("Choose a valid ordering environment.");
  const part = String(value.part || "").trim();
  const po = String(value.po || "").trim().toUpperCase();
  const mo = String(value.mo || "").trim();
  const lineCode = String(value.lineCode || "").trim();
  const branch = String(value.branch || "").trim();
  if (!part || part.length > 28 || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 24) throw new Error("Enter a product number and a quantity from 1 to 24.");
  if (!/^[A-Z0-9-]{1,15}$/.test(po)) throw new Error("Use a PO of 1–15 letters, numbers or hyphens.");
  if (mode === "test" && !/^TEST[-A-Z0-9]{1,11}$/.test(po)) throw new Error("Test POs must start with TEST.");
  if (mode === "production" && po.startsWith("TEST")) throw new Error("A TEST PO cannot be submitted to production.");
  if (mo.length > 40 || lineCode.length > 4 || branch.length > 20) throw new Error("An order field is too long.");
  return { part, quantity, po, mo, lineCode, branch, mode };
}

// One order for a PO in each environment, even across tabs and request retries.
export function usafPurchaseId(mode: string, po: string) {
  const hex = createHash("sha256").update(`usaf-standalone:${mode}:${po.trim().toUpperCase()}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function signature(payload: string, key: string) { return createHmac("sha256", key).update(payload).digest(); }
export function signUsafPreview(value: UsafSignedPreview, key: string) {
  if (!key) throw new Error("Preview signing is unavailable.");
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${signature(payload, key).toString("base64url")}`;
}
export function readUsafPreview(token: string, key: string, userId: string): UsafSignedPreview {
  if (!key || token.length > 6000) throw new Error("Review the order again before submitting.");
  const [payload, mac, extra] = token.split(".");
  const actual = Buffer.from(mac || "", "base64url");
  const expected = signature(payload || "", key);
  if (!payload || extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("The order preview is invalid. Review it again.");
  const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as UsafSignedPreview;
  validateUsafPurchase(value);
  if (value.userId !== userId || !Number.isFinite(value.expiresAt) || value.expiresAt < Date.now() || !Number.isFinite(value.total)) throw new Error("The preview expired or belongs to another user. Review it again.");
  return value;
}
