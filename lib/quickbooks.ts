import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";

function encryptionKey() {
  const encoded = process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("QuickBooks token encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("QuickBooks token encryption key must be 32 bytes.");
  return key;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decrypt(value: string) {
  if (!value.startsWith("v1:")) return value;
  const [, iv, tag, ciphertext] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function quickBooksConfig() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  const environment = (process.env.QUICKBOOKS_ENVIRONMENT || "sandbox").trim().toLowerCase();
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
  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) : {};
  if (!response.ok) throw new Error(data.error_description || data.error || "QuickBooks token exchange failed.");
  return data as { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number };
}

export async function saveConnection(realmId: string, tokens: Awaited<ReturnType<typeof exchangeAuthorizationCode>>) {
  const admin = createAdminClient();
  const now = Date.now();
  const { error } = await admin.from("quickbooks_connections").upsert({
    id: true,
    realm_id: encrypt(realmId),
    environment: quickBooksConfig().environment,
    access_token: encrypt(tokens.access_token),
    refresh_token: encrypt(tokens.refresh_token),
    access_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

type Connection = {
  realm_id: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
};

async function refreshConnection(connection: Connection) {
  const config = quickBooksConfig();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refresh_token }),
    cache: "no-store",
  });
  const responseText = await response.text();
  const tokens = responseText ? JSON.parse(responseText) : {};
  if (!response.ok) throw new Error(tokens.error_description || "QuickBooks token refresh failed.");
  await saveConnection(connection.realm_id, tokens);
  return { ...connection, access_token: tokens.access_token, refresh_token: tokens.refresh_token };
}

export async function getConnection() {
  const admin = createAdminClient();
  const { data, error } = await admin.from("quickbooks_connections").select("*").eq("id", true).single();
  if (error || !data) throw new Error("QuickBooks is not connected.");
  const stored = data as Connection;
  const connection = {
    ...stored,
    realm_id: decrypt(stored.realm_id),
    access_token: decrypt(stored.access_token),
    refresh_token: decrypt(stored.refresh_token),
  };
  if (!stored.realm_id.startsWith("v1:") || !stored.access_token.startsWith("v1:") || !stored.refresh_token.startsWith("v1:")) {
    const { error: encryptionError } = await admin.from("quickbooks_connections").update({
      realm_id: encrypt(connection.realm_id),
      access_token: encrypt(connection.access_token),
      refresh_token: encrypt(connection.refresh_token),
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (encryptionError) throw new Error(encryptionError.message);
  }
  if (new Date(connection.access_expires_at).getTime() <= Date.now() + 120000) {
    return refreshConnection(connection);
  }
  return connection;
}

export async function quickBooksRequest(path: string, init: RequestInit = {}) {
  let connection = await getConnection();
  const base = quickBooksConfig().environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

  const send = () => fetch(`${base}/v3/company/${connection.realm_id}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.access_token}`,
      ...init.headers,
    },
    cache: "no-store",
  });

  let response = await send();
  if (response.status === 401) {
    connection = await refreshConnection(connection);
    response = await send();
  }
  const intuitTid = response.headers.get("intuit_tid");
  const responseText = await response.text();
  let data: Record<string, any> = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const message = data?.Fault?.Error?.[0]?.Detail || data?.Fault?.Error?.[0]?.Message || data?.error_description || data?.error || `QuickBooks request failed with status ${response.status}.`;
    console.error("QuickBooks API error", { status: response.status, intuitTid, path });
    throw new Error(`${message}${intuitTid ? ` (Intuit reference: ${intuitTid})` : ""}`);
  }
  return data;
}

export function escapeQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function disconnectQuickBooks() {
  const connection = await getConnection();
  const config = quickBooksConfig();
  const response = await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ token: connection.refresh_token }),
    cache: "no-store",
  });
  if (!response.ok && response.status !== 400) {
    throw new Error("QuickBooks did not accept the disconnect request.");
  }
  const admin = createAdminClient();
  const { error } = await admin.from("quickbooks_connections").delete().eq("id", true);
  if (error) throw new Error(error.message);
}
