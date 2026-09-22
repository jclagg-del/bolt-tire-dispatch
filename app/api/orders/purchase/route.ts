import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { atdEnvironment, placeAtdOrder, previewAtdOrder, searchAtdByPartNumber } from "@/lib/atd";
import { matchesProductNumber, purchasingRequestId, supplierOrderDetails } from "@/lib/customer-order-purchasing";
import { usaForceOrderingStatus } from "@/lib/usaf";
import { searchUsafOrderProduct, previewUsafOrder, placeUsafOrder } from "@/lib/usaf-ordering";

export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const body = await request.json();
    const admin = createAdminClient();
    if (body.action === "configuration") return NextResponse.json({ connections: { USAF: usaForceOrderingStatus(), ATD: { configured: Boolean(process.env.ATD_USERNAME && process.env.ATD_PASSWORD && process.env.ATD_CLIENT_ID), production: atdEnvironment === "production" } } });
    if (body.action === "records") {
      const ids: number[] = Array.isArray(body.orderIds) ? [...new Set<number>(body.orderIds.filter((id: unknown) => Number.isInteger(id) && Number(id) > 0))].slice(0, 500) : [];
      if (!ids.length) return NextResponse.json({ records: {} });
      const { data, error } = await admin.from("supplier_orders").select("request_id,status,response,confirmation_number").in("request_id", ids.map(purchasingRequestId));
      if (error) throw error;
      const records = Object.fromEntries(ids.flatMap(id => {
        const row = data?.find(item => item.request_id === purchasingRequestId(id));
        return row ? [[id, { ...supplierOrderDetails(row.response), status: row.status }]] : [];
      }));
      return NextResponse.json({ records });
    }
    const id = Number(body.orderId);
    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "A valid customer order is required." }, { status: 400 });
    const { data: order, error } = await admin.from("customer_orders").select("id,customer,job_number,mo_number,qty,tire_size,tire_product_number,tires_ordered,order_status,approved_job_id").eq("id", id).single();
    if (error || !order) return NextResponse.json({ error: "Customer order not found." }, { status: 404 });
    const requestId = purchasingRequestId(id);
    const { data: existing, error: existingError } = await admin.from("supplier_orders").select("status,response").eq("request_id", requestId).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "placed") {
      // Recover the checkbox if the supplier succeeded but updating the request failed.
      const { error: syncError } = await admin.from("customer_orders").update({ tires_ordered: true }).eq("id", id);
      return NextResponse.json({ completed: supplierOrderDetails(existing.response), warning: syncError ? "The purchase is saved. Refresh the request to restore its ordered status." : null });
    }
    if (existing) return NextResponse.json({ error: "A purchase was already submitted for this request. Check Supplier Orders or contact the supplier before ordering again; its outcome needs confirmation." }, { status: 409 });
    if (order.order_status !== "new" || order.approved_job_id || order.tires_ordered) return NextResponse.json({ error: "Only a new request without tires already ordered can use this button." }, { status: 409 });
    const part = String(order.tire_product_number || "").trim();
    const po = String(order.job_number || "").trim();
    const quantity = Number(order.qty);
    if (!part || !po || !Number.isInteger(quantity) || quantity < 1 || quantity > 24) return NextResponse.json({ error: "The request needs a product number, job number, and a quantity from 1 to 24." }, { status: 400 });
    if (!["search", "preview", "place"].includes(body.action)) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    if (body.action !== "search" && (body.expectedPo !== po || body.expectedQuantity !== quantity)) return NextResponse.json({ error: "This request's job number or quantity changed. Reopen the order window before continuing." }, { status: 409 });
    if (!["USAF", "ATD"].includes(body.supplier)) return NextResponse.json({ error: "Choose U.S. AutoForce or ATD." }, { status: 400 });
    const usaf = body.supplier === "USAF";
    const supplier = usaf ? "U.S. AutoForce" : "ATD";
    const sandbox = usaf ? !usaForceOrderingStatus().production : atdEnvironment !== "production";
    const products = usaf ? await searchUsafOrderProduct(part, quantity, String(body.lineCode || "")) : (await searchAtdByPartNumber(part, true)).filter(product => matchesProductNumber(part, product));
    if (body.action === "search") return NextResponse.json({ products, po, quantity, part, sandbox });
    const product = products.find(item => item.atdProductNumber === body.productNumber && (!usaf || ("lineCode" in item && item.lineCode === body.lineCode)));
    if (!product) return NextResponse.json({ error: `No exact product-number match was found at ${supplier}. Check the requested tire before ordering.` }, { status: 400 });
    const purchase = { atdProductNumber: product.atdProductNumber, quantity, customerPoNumber: po, customerComment: `${order.customer} | MO ${order.mo_number || "—"} | Request ${id}` };
    const usafInput = { part, lineCode: String(body.lineCode || ""), branch: String(body.branch || ""), quantity, po, mo: String(order.mo_number || ""), transaction: requestId };
    const usafPreview = usaf ? await previewUsafOrder(usafInput) : null;
    const preview = usafPreview || await previewAtdOrder(purchase);
    const details = supplierOrderDetails(preview);
    if (body.action === "preview") return NextResponse.json({ preview: details, sandbox });
    if (sandbox) return NextResponse.json({ error: `${supplier} is using test access. Production credentials are required before placing real orders.` }, { status: 409 });
    if (details.deliveryDate !== (body.expectedDeliveryDate || null)) return NextResponse.json({ error: "The supplier delivery estimate changed. Review a new preview before ordering." }, { status: 409 });
    if (!Number.isFinite(details.total) || details.total === null || details.total < 0 || Math.abs(Number(body.expectedTotal) - details.total) > 0.005 || !Number.isFinite(body.expectedTotal)) return NextResponse.json({ error: "The supplier total changed or is unavailable. Review a fresh preview before ordering." }, { status: 409 });
    const { error: claimError } = await admin.from("supplier_orders").insert({ request_id: requestId, supplier, atd_product_number: product.atdProductNumber, quantity, customer_po_number: po, customer_comment: purchase.customerComment, status: "pending", created_by: user.id, response: { supplier, preview, customerOrderId: id } });
    if (claimError?.code === "23505") return NextResponse.json({ error: "This request is already being ordered. Close and reopen the window to check the result." }, { status: 409 });
    if (claimError) throw claimError;
    let result: Record<string, unknown>;
    try {
      result = usafPreview ? await placeUsafOrder(usafInput, usafPreview) : await placeAtdOrder(purchase);
    } catch (reason) {
      await admin.from("supplier_orders").update({ status: "needs_review", response: { supplier, preview, customerOrderId: id, error: reason instanceof Error ? reason.message : "Supplier response unavailable" } }).eq("request_id", requestId);
      return NextResponse.json({ error: `${supplier} did not return a confirmed result. Check Supplier Orders or contact the supplier before trying again; this request is blocked from a duplicate purchase.` }, { status: 502 });
    }
    const completed = supplierOrderDetails(result);
    if (!completed.confirmation) {
      await admin.from("supplier_orders").update({ status: "needs_review", response: result }).eq("request_id", requestId);
      return NextResponse.json({ error: `No supplier confirmation number was returned. Check with ${supplier} before ordering again.` }, { status: 502 });
    }
    const { error: recordError } = await admin.from("supplier_orders").update({ status: "placed", confirmation_number: completed.confirmation, order_total: completed.total, response: result }).eq("request_id", requestId);
    const { error: checkboxError } = await admin.from("customer_orders").update({ tires_ordered: true }).eq("id", id);
    return NextResponse.json({ completed, warning: recordError || checkboxError ? `${supplier} confirmed ${completed.confirmation}, but saving all request details failed. Do not reorder. ${recordError?.message || checkboxError?.message}` : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The supplier request could not be completed." }, { status: 502 });
  }
}
