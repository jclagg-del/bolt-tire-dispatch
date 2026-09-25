import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { usaForceOrderingStatus } from "@/lib/usaf";
import { searchUsafOrderProduct, previewUsafOrder, placeUsafOrder } from "@/lib/usaf-ordering";
import { supplierOrderDetails } from "@/lib/customer-order-purchasing";
import { readUsafPreview, signUsafPreview, usafPurchaseId, validateUsafPurchase } from "@/lib/usaf-purchase-preview";

export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const admin = createAdminClient();
  const { data: staff, error: staffError } = await admin.from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
  if (staffError || !staff || !["admin", "office", "technician"].includes(staff.role)) return NextResponse.json({ error: "Staff access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const connection = usaForceOrderingStatus();
    const mode = connection.production ? "production" : connection.test ? "test" : "unavailable";
    if (body.action === "configuration") return NextResponse.json({ configured: connection.configured, mode });
    if (!["search", "preview", "place"].includes(body.action)) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const input = body.action === "place" ? readUsafPreview(String(body.token || ""), key, user.id) : validateUsafPurchase(body);
    const requestId = usafPurchaseId(input.mode, input.po);
    // Read before any supplier calls. A lost response must never cause a second order.
    const { data: existing, error: readError } = await admin.from("supplier_orders").select("status,response,atd_product_number,quantity,customer_po_number").eq("request_id", requestId).maybeSingle();
    if (readError) throw readError;
    if (existing?.status === "placed") return NextResponse.json({ completed: supplierOrderDetails(existing.response), mode: existing.response?.mode || input.mode, saved: true, receipt: { part: existing.atd_product_number, quantity: existing.quantity, po: existing.customer_po_number, description: existing.response?.product?.model || "" } });
    if (existing) return NextResponse.json({ error: "This PO already has a submission awaiting confirmation. Check Supplier Orders and contact USAF before trying another PO; do not order again.", uncertain: true }, { status: 409 });
    if (!connection.configured || mode === "unavailable" || mode !== input.mode) return NextResponse.json({ error: "The supplier environment changed or is not configured. Reopen the order window. No purchase was sent." }, { status: 409 });
    if (body.action === "search") return NextResponse.json({ mode, products: await searchUsafOrderProduct(input.part, input.quantity, input.lineCode) });
    const preview = await previewUsafOrder(input);
    const details = supplierOrderDetails(preview);
    if (details.total === null || !Number.isFinite(details.total) || details.total <= 0) throw new Error("USAF did not provide a valid total.");
    if (body.action === "preview") return NextResponse.json({ mode, preview: details, product: preview.product, token: signUsafPreview({ ...input, userId: user.id, expiresAt: Date.now() + 10 * 60_000, total: details.total, deliveryDate: details.deliveryDate }, key) });
    if (body.confirmation !== (mode === "test" ? "SEND TEST ORDER" : "PLACE LIVE ORDER")) return NextResponse.json({ error: "Confirm the displayed order before submitting." }, { status: 400 });
    const signed = input as ReturnType<typeof readUsafPreview>;
    if (Math.abs(details.total - signed.total) > 0.005 || details.deliveryDate !== signed.deliveryDate) return NextResponse.json({ error: "The price or delivery estimate changed. Review the order again. Nothing was submitted." }, { status: 409 });
    const note = mode === "test" ? "TEST ONLY - DO NOT FULFILL. USAF integration certification; no customer job." : `Job / PO ${input.po} | MO ${input.mo || "—"}`;
    const metadata = { mode, testOnly: mode === "test", standalone: true, product: preview.product, preview };
    const { error: claimError } = await admin.from("supplier_orders").insert({ request_id: requestId, supplier: "U.S. AutoForce", atd_product_number: input.part, quantity: input.quantity, customer_po_number: input.po, customer_comment: note, status: "pending", created_by: user.id, response: metadata });
    if (claimError?.code === "23505") return NextResponse.json({ error: "This PO was already submitted. Refresh Supplier Orders; do not submit another order.", uncertain: true }, { status: 409 });
    if (claimError) throw claimError;
    let result;
    try {
      result = await placeUsafOrder({ ...input, transaction: requestId, testMode: mode === "test" }, preview);
    } catch (error) {
      await admin.from("supplier_orders").update({ status: "needs_review", response: { ...metadata, error: error instanceof Error ? error.message : "Supplier response unavailable" } }).eq("request_id", requestId);
      return NextResponse.json({ error: "USAF did not return a confirmed result. This PO is locked against resubmission. Check Supplier Orders and ask USAF to verify it before ordering again.", uncertain: true }, { status: 502 });
    }
    const completed = supplierOrderDetails(result);
    const { error: saveError } = await admin.from("supplier_orders").update({ status: "placed", confirmation_number: completed.confirmation, order_total: completed.total, response: { ...metadata, ...result } }).eq("request_id", requestId);
    return NextResponse.json({ completed, mode, receipt: { part: input.part, quantity: input.quantity, po: input.po, description: preview.product.model }, saved: !saveError, warning: saveError ? `USAF confirmed ${completed.confirmation}, but saving the confirmation failed. Keep this number and do not reorder.` : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The USAF request could not be completed." }, { status: 400 });
  }
}
