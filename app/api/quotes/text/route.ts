import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { QuoteTextError, quoteTextPreview, sendQuoteText, validQuoteId } from "@/lib/quote-text";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function authorize(request: Request) {
  const user = await requireApiUser(request);
  if (!user) throw new QuoteTextError("Please sign in again.", 401);
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_security").select("role,password_change_required").eq("user_id", user.id).maybeSingle();
  if (error || !data || !["admin", "office"].includes(data.role) || data.password_change_required) throw new QuoteTextError("Office or admin access with completed password setup is required.", 403);
  return { admin, user };
}
const failure = (error: unknown) => reply({ error: error instanceof QuoteTextError ? error.message : "Could not confirm the texting result. Close this window and review again; check Quo before resending." }, error instanceof QuoteTextError ? error.status : 503);
export async function GET(request: Request) {
  try {
    const { admin } = await authorize(request);
    return reply(await quoteTextPreview(admin, validQuoteId(new URL(request.url).searchParams.get("quoteId"))));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { admin, user } = await authorize(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint)) throw new QuoteTextError("Review the message before sending it.");
    return reply(await sendQuoteText(admin, user.id, { quoteId: validQuoteId(body.quoteId), fingerprint: body.fingerprint, resend: body.resend === true }));
  } catch (error) { return failure(error); }
}
