import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { BillingReceiptError, billingReceipt, receiptFingerprint, sendBillingReceipt } from "@/lib/billing-receipt";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function authorize(request: Request) {
  const user = await requireApiUser(request);
  if (!user) throw new BillingReceiptError("Please sign in again.", 401);
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_security").select("role,password_change_required").eq("user_id", user.id).maybeSingle();
  if (error || !data || !["admin", "office"].includes(data.role) || data.password_change_required) throw new BillingReceiptError("Office or admin access with completed password setup is required.", 403);
  return admin;
}
function jobId(value: unknown) {
  const id = String(value ?? "");
  if (!/^[1-9]\d{0,18}$/.test(id)) throw new BillingReceiptError("Choose a valid paid job.");
  return id;
}
const failure = (error: unknown) => reply({ error: error instanceof BillingReceiptError ? error.message : "Could not verify the payment or send the receipt. Please try again." }, error instanceof BillingReceiptError ? error.status : 502);
export async function GET(request: Request) {
  try {
    const admin = await authorize(request);
    const receipt = await billingReceipt(admin, jobId(new URL(request.url).searchParams.get("jobId")));
    return reply({ receipt, fingerprint: receiptFingerprint(receipt) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const admin = await authorize(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.fingerprint !== "string") throw new BillingReceiptError("Review the receipt before sending it.");
    const receipt = await billingReceipt(admin, jobId(body.jobId));
    if (receiptFingerprint(receipt) !== body.fingerprint) throw new BillingReceiptError("The payment or customer email changed. Close this window and review the receipt again.", 409);
    return reply(await sendBillingReceipt(receipt));
  } catch (error) { return failure(error); }
}
