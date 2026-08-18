import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "kingdom_portal";
const TOKEN_MESSAGE = "kingdom-support-services";

function signature() {
  const secret = process.env.KINGDOM_PORTAL_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret).update(TOKEN_MESSAGE).digest("hex");
}

export function validKingdomPin(pin: string) {
  const expected = process.env.KINGDOM_PORTAL_PIN || "";
  const supplied = Buffer.from(pin);
  const target = Buffer.from(expected);
  return supplied.length === target.length && target.length > 0 && timingSafeEqual(supplied, target);
}

export async function hasKingdomAccess() {
  const value = (await cookies()).get(COOKIE_NAME)?.value || "";
  const expected = signature();
  if (!value || !expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export async function grantKingdomAccess() {
  (await cookies()).set(COOKIE_NAME, signature(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

