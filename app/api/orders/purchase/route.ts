import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";
import { atdEnvironment, placeAtdOrder, previewAtdOrder, searchAtdByPartNumber } from "@/lib/atd";
import { matchesProductNumber, purchasingRequestId, jobPurchasingRequestId, supplierOrderDetails } from "@/lib/customer-order-purchasing";
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
    const jobPurchase = body.jobId != null;
    let jobId: string | number | null = null;
    let linkedOrderId: number | null = null;
    const fields = "id,customer,job_number,mo_number,qty,tire_size,tire_product_number,tires_ordered,order_status,approved_job_id,tire_items";
    let order;
    let error;
    if (jobPurchase) {
      const staff = await admin.from("staff_security").select("role").eq("user_id", user.id).maybeSingle();
      if (staff.error || !["admin", "office", "technician"].includes(staff.data?.role || "")) return NextResponse.json({ error: "Staff access is required to order tires for a job." }, { status: 403 });
      if (!/^(?:[1-9]\d*|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(String(body.jobId))) return NextResponse.json({ error: "Save the job before ordering tires." }, { status: 400 });
      const { data: job, error: jobError } = await admin.from("jobs").select("id,customer,po_number,mo_number,qty,size,tire_product_number,tires_ordered,complete,archived").eq("id", body.jobId).single();
      if (jobError || !job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
      if (job.complete || job.archived) return NextResponse.json({ error: "Completed or archived jobs cannot order more tires." }, { status: 409 });
      jobId = job.id;
      const linked = await admin.from("customer_orders").select(fields).eq("approved_job_id", job.id).limit(2);
      if (linked.error) throw linked.error;
      if ((linked.data?.length || 0) > 1) return NextResponse.json({ error: "Multiple customer requests are linked to this job. Review those requests before ordering." }, { status: 409 });
      const source = linked.data?.[0];
      if (source && ["rejected", "cancellation_requested"].includes(source.order_status)) return NextResponse.json({ error: "Review the rejected or cancelled request before ordering." }, { status: 409 });
      linkedOrderId = source?.id ?? null;
      order = { ...source, id: job.id, customer: job.customer, job_number: job.po_number, mo_number: job.mo_number, qty: job.qty, tire_size: job.size, tire_product_number: job.tire_product_number, tires_ordered: job.tires_ordered || Boolean(source?.tires_ordered), order_status: "new", approved_job_id: null };
      if (source && (String(source.tire_product_number || "").trim() !== String(job.tire_product_number || "").trim() || Number(source.qty) !== Number(job.qty))) return NextResponse.json({ error: "This job's tire or quantity differs from its original request. Review the existing purchase before ordering from the job." }, { status: 409 });
    } else {
      const id = Number(body.orderId);
      if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "A valid customer order is required." }, { status: 400 });
      ({ data: order, error } = await admin.from("customer_orders").select(fields).eq("id", id).single());
      linkedOrderId = id;
    }
    if (error || !order) return NextResponse.json({ error: "Customer order not found." }, { status: 404 });
    const id = order.id;
    // The Orders card and its resulting job must share one purchase claim.
    const requestId = linkedOrderId != null ? purchasingRequestId(linkedOrderId) : jobPurchasingRequestId(jobId!);
    const syncPurchase = async (details: ReturnType<typeof supplierOrderDetails>) => {
      const errors: string[] = [];
      if (linkedOrderId != null) {
        const result = await admin.from("customer_orders").update({ tires_ordered: true }).eq("id", linkedOrderId);
        if (result.error) errors.push(result.error.message);
      }
      if (jobId != null) {
        const result = await admin.from("jobs").update({ tires_ordered: true, tire_supplier: details.supplier, estimated_delivery_date: details.deliveryDate }).eq("id", jobId);
        if (result.error) errors.push(result.error.message);
      }
      return errors.join("; ");
    };
    const { data: existing, error: existingError } = await admin.from("supplier_orders").select("status,response").eq("request_id", requestId).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "placed") {
      // Recover the checkbox if the supplier succeeded but updating the request failed.
      if (jobPurchase && existing.response?.requestedPart && (existing.response.requestedPart !== String(order.tire_product_number || "").trim() || existing.response.requestedQuantity !== Number(order.qty))) return NextResponse.json({ error: "Tires were already purchased for this job before its details changed. Review Supplier Orders; do not reorder." }, { status: 409 });
      const completed = supplierOrderDetails(existing.response);
      const syncError = await syncPurchase(completed);
      return NextResponse.json({ completed, warning: syncError ? "The purchase is saved, but updating its ordered status failed. Do not reorder. " + syncError : null });
    }
    if (existing) return NextResponse.json({ error: "A purchase was already submitted for this request. Check Supplier Orders or contact the supplier before ordering again; its outcome needs confirmation." }, { status: 409 });
    if (order.order_status !== "new" || order.approved_job_id || order.tires_ordered) return NextResponse.json({ error: "Tires must not already be ordered, and the request or job must still be active." }, { status: 409 });
    if (Array.isArray(order.tire_items) && order.tire_items.length > 1) return NextResponse.json({ error: "This order has different front/rear tires. Purchase each listed part in Tire Shop, then record the supplier and delivery date here." }, { status: 409 });
    const part = String(order.tire_product_number || "").trim();
    const po = String(order.job_number || "").trim();
    const quantity = Number(order.qty);
    if (jobPurchase && !/^[a-z0-9.-]+$/i.test(part)) return NextResponse.json({ error: "Enter one exact tire product number. Split front/rear purchases must be ordered separately in Tire Shop." }, { status: 400 });
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
    const purchase = { atdProductNumber: product.atdProductNumber, quantity, customerPoNumber: po, customerComment: `${order.customer} | MO ${order.mo_number || "—"} | ${jobPurchase ? "Job" : "Request"} ${id}` };
    const usafInput = { part, lineCode: String(body.lineCode || ""), branch: String(body.branch || ""), quantity, po, mo: String(order.mo_number || ""), transaction: requestId };
    const usafPreview = usaf ? await previewUsafOrder(usafInput) : null;
    const preview = usafPreview || await previewAtdOrder(purchase);
    const details = supplierOrderDetails(preview);
    if (body.action === "preview") return NextResponse.json({ preview: details, sandbox });
    if (sandbox) return NextResponse.json({ error: `${supplier} is using test access. Production credentials are required before placing real orders.` }, { status: 409 });
    if (details.deliveryDate !== (body.expectedDeliveryDate || null)) return NextResponse.json({ error: "The supplier delivery estimate changed. Review a new preview before ordering." }, { status: 409 });
    if (!Number.isFinite(details.total) || details.total === null || details.total < 0 || Math.abs(Number(body.expectedTotal) - details.total) > 0.005 || !Number.isFinite(body.expectedTotal)) return NextResponse.json({ error: "The supplier total changed or is unavailable. Review a fresh preview before ordering." }, { status: 409 });
    const context = { customerOrderId: linkedOrderId, jobId, requestedPart: part, requestedQuantity: quantity };
    const { error: claimError } = await admin.from("supplier_orders").insert({ request_id: requestId, supplier, atd_product_number: product.atdProductNumber, quantity, customer_po_number: po, customer_comment: purchase.customerComment, status: "pending", created_by: user.id, response: { supplier, preview, ...context } });
    if (claimError?.code === "23505") return NextResponse.json({ error: "This request is already being ordered. Close and reopen the window to check the result." }, { status: 409 });
    if (claimError) throw claimError;
    let result: Record<string, unknown>;
    try {
      result = usafPreview ? await placeUsafOrder(usafInput, usafPreview) : await placeAtdOrder(purchase);
    } catch (reason) {
      await admin.from("supplier_orders").update({ status: "needs_review", response: { supplier, preview, ...context, error: reason instanceof Error ? reason.message : "Supplier response unavailable" } }).eq("request_id", requestId);
      return NextResponse.json({ error: `${supplier} did not return a confirmed result. Check Supplier Orders or contact the supplier before trying again; this request is blocked from a duplicate purchase.` }, { status: 502 });
    }
    const completed = supplierOrderDetails(result);
    if (!completed.confirmation) {
      await admin.from("supplier_orders").update({ status: "needs_review", response: { ...result, ...context } }).eq("request_id", requestId);
      return NextResponse.json({ error: `No supplier confirmation number was returned. Check with ${supplier} before ordering again.` }, { status: 502 });
    }
    const { error: recordError } = await admin.from("supplier_orders").update({ status: "placed", confirmation_number: completed.confirmation, order_total: completed.total, response: { ...result, ...context } }).eq("request_id", requestId);
    const syncError = await syncPurchase(completed);
    return NextResponse.json({ completed, warning: recordError || syncError ? `${supplier} confirmed ${completed.confirmation}, but saving all request details failed. Do not reorder. ${recordError?.message || syncError}` : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The supplier request could not be completed." }, { status: 502 });
  }
}
