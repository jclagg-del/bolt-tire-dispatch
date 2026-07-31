import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { authorizationUrl, createOAuthState } from "@/lib/quickbooks";

export async function POST(request: Request) {
  if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const state = createOAuthState();
    const response = NextResponse.json({ url: authorizationUrl(state) });
    response.cookies.set("qb_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "QuickBooks setup failed." }, { status: 500 });
  }
}
