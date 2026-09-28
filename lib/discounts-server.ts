import "server-only";
import { createAdminClient, requireApiUser } from "./supabase/admin";
import { discountIsAvailable, normalizeDiscountCode, type DiscountCode } from "./discounts";

export async function requireDiscountAdmin(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return null;
  const { data, error } = await createAdminClient().from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
  return !error && data?.role === "admin" ? user : null;
}

export async function lookupDiscount(value: unknown): Promise<DiscountCode | null> {
  const code = normalizeDiscountCode(value);
  if (!code) return null;
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) throw new Error("That discount code is not available.");
  const { data, error } = await createAdminClient().from("discount_codes").select("*").eq("code", code).maybeSingle();
  if (error) throw new Error("Discount codes could not be checked. Please try again.");
  if (!data || !discountIsAvailable(data as DiscountCode)) throw new Error("That discount code is not available or has expired.");
  return data as DiscountCode;
}
