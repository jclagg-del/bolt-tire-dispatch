import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { purchasingRequestId } from "@/lib/customer-order-purchasing";
import { canEditFleetOrder, changedPurchaseFields, editableOrderFields, normalizeOrderEdit, type OrderRecord } from "@/lib/staff-order-edit";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
class EditError extends Error { constructor(message: string, public status = 400) { super(message); } }
type Context = { params: Promise<{ id: string }> };
// A stable full-row fingerprint detects portal edits, purchases, payments and approvals.
function version(row: OrderRecord) { return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])))).digest("hex"); }
async function load(request: Request, context: Context) {
  const user = await requireApiUser(request);
  if (!user) throw new EditError("Please sign in again.", 401);
  const admin = createAdminClient();
  const staff = await admin.from("staff_security").select("role,password_change_required").eq("user_id", user.id).maybeSingle();
  if (staff.error || !["admin", "office"].includes(staff.data?.role || "") || staff.data?.password_change_required) throw new EditError("Office or admin access with completed password setup is required.", 403);
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new EditError("Invalid order number.");
  const result = await admin.from("customer_orders").select("*").eq("id", Number(id)).maybeSingle();
  if (result.error) throw new EditError("The order could not be loaded.", 500);
  if (!result.data) throw new EditError("Order not found.", 404);
  const order = result.data as OrderRecord;
  if (!canEditFleetOrder(order)) throw new EditError("Only unaccepted, unpaid Kingdom or HPR portal orders can be edited here. For an accepted order, open its job instead.", 409);
  const purchase = await admin.from("supplier_orders").select("status").eq("request_id", purchasingRequestId(Number(id))).maybeSingle();
  if (purchase.error) throw new EditError("Purchase status could not be checked. No changes were made.", 500);
  return { admin, order, purchaseLocked: Boolean(order.tires_ordered || purchase.data), requestId: purchasingRequestId(Number(id)) };
}
const fail = (error: unknown) => reply({ error: error instanceof EditError ? error.message : "The order could not be saved. Refresh and check it before trying again." }, error instanceof EditError ? error.status : 500);

export async function GET(request: Request, context: Context) {
  try {
    const { admin, order, purchaseLocked } = await load(request, context);
    const facilities = await admin.from("kingdom_facilities").select("id,name,address,contact_name,contact_number").eq("active", true).order("name");
    if (facilities.error) throw new EditError("Facilities could not be loaded.", 500);
    return reply({ order: { id: order.id, ...editableOrderFields(order) }, version: version(order), purchaseLocked, facilities: facilities.data || [] });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { admin, order, purchaseLocked, requestId } = await load(request, context);
    let body;
    try { body = await request.json(); } catch { throw new EditError("Invalid request."); }
    if (!body || body.version !== version(order)) throw new EditError("This order changed since you opened it. Reload the order before saving; your changes have not been applied.", 409);
    let changes;
    try { changes = normalizeOrderEdit(body.changes, order); } catch (error) { throw new EditError(error instanceof Error ? error.message : "Invalid changes."); }
    if (purchaseLocked && changedPurchaseFields(order, changes)) throw new EditError("Tires have already been ordered or a purchase is pending. Tire, quantity, organization and reference details are locked; contact, facility and appointment details can still be corrected.", 409);
    if (changes.facility_id !== order.facility_id && changes.facility_id != null) {
      const facility = await admin.from("kingdom_facilities").select("id,name").eq("id", changes.facility_id).eq("active", true).maybeSingle();
      if (facility.error || !facility.data) throw new EditError("Select an active facility or enter a custom facility.");
      changes.facility_name = facility.data.name;
    }
    const result = await admin.rpc("staff_edit_fleet_order", { p_id: order.id, p_expected: order, p_changes: changes, p_request_id: requestId });
    if (result.error) {
      if (result.error.code === "P0001") throw new EditError(result.error.message, 409);
      throw new EditError("The changes could not be saved. Refresh and try again.", 500);
    }
    return reply({ saved: true, id: order.id });
  } catch (error) { return fail(error); }
}
