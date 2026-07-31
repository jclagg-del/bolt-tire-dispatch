import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode, saveConnection, verifyOAuthState } from "@/lib/quickbooks";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state") || "";
  const cookieState = request.cookies.get("qb_oauth_state")?.value;
  const destination = new URL("/billing", request.url);

  if (!code || !realmId || !cookieState || state !== cookieState || !verifyOAuthState(state)) {
    destination.searchParams.set("quickbooks", "invalid_state");
    return NextResponse.redirect(destination);
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    await saveConnection(realmId, tokens);
    destination.searchParams.set("quickbooks", "connected");
  } catch (error) {
    destination.searchParams.set("quickbooks", "error");
    destination.searchParams.set("message", error instanceof Error ? error.message : "Connection failed");
  }

  const response = NextResponse.redirect(destination);
  response.cookies.delete("qb_oauth_state");
  return response;
}
