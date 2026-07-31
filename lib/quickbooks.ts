import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";

export function quickBooksConfig() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  const environment = process.env.QUICKBOOKS_ENVIRONMENT || "sandbox";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("QuickBooks environment variables are not configured.");
  }
  return { clientId, clientSecret, redirectUri, environment };
}

export function createOAuthState() {
  const { clientSecret } = quickBooksConfig();
  const value = `${Date.now()}.${crypto.randomUUID()}`;
  const signature = createHmac("sha256", clientSecret).update(value).digest("hex");
  return `${value}.${signature}`;
}

export function verifyOAuthState(state: string) {
  const { clientSecret } = quickBooksConfig();
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const value = `${parts[0]}.${parts[1]}`;
  if (Date.now() - Number(parts[0]) > 10 * 60 * 1000) return false;
  const expected = createHmac("sha256", clientSecret).update(value).digest("hex");
  const actual = parts[2];
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function authorizationUrl(state: string) {
  const { clientId, redirectUri } = quickBooksConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeAuthorizationCode(code: string) {
  const config = quickBooksConfig();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "QuickBooks token exchange failed.");
  return data as { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number };
}

export async function saveConnection(realmId: string, tokens: Awaited<ReturnType<typeof exchangeAuthorizationCode>>) {
  const admin = createAdminClient();
  const now = Date.now();
  const { error } = await admin.from("quickbooks_connections").upsert({
    id: true,
    realm_id: realmId,
    environment: quickBooksConfig().environment,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
