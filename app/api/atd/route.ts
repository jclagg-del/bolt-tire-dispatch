import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { atdEnvironment, fitmentList, placeAtdOrder, previewAtdOrder, searchAtdByFitment, searchAtdBySize } from "@/lib/atd";

async function staffAuthorized(request: NextRequest) {
  return requireApiUser(request);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authorized = await staffAuthorized(request);
    const includeCost = Boolean(body.internal) && Boolean(authorized);
    if (["preview-order", "place-order"].includes(body.action)) {
      if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const quantity = Number(body.quantity);
      const atdProductNumber = String(body.atdProductNumber || "").trim();
      if (!atdProductNumber || !Number.isInteger(quantity) || quantity < 1 || quantity > 24) return NextResponse.json({ error: "A valid supplier product and quantity are required." }, { status: 400 });
      const orderRequest = { atdProductNumber, quantity, customerPoNumber: String(body.customerPoNumber || "").trim(), customerComment: String(body.customerComment || "").trim() };
      if (body.action === "preview-order") return NextResponse.json({ preview: await previewAtdOrder(orderRequest) });
      const requestId = String(body.requestId || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return NextResponse.json({ error: "A valid order request ID is required." }, { status: 400 });
      const admin = createAdminClient();
      const pendingRecord = {
        request_id: requestId, supplier: "ATD", atd_product_number: atdProductNumber, quantity,
        customer_po_number: orderRequest.customerPoNumber || null,
        customer_comment: orderRequest.customerComment || null,
        status: "pending", created_by: authorized?.id || null,
      };
      const { error: pendingError } = await admin.from("supplier_orders").insert(pendingRecord);
      if (pendingError?.code === "23505") {
        const { data: existing } = await admin.from("supplier_orders").select("status,response").eq("request_id", requestId).maybeSingle();
        if (existing?.status === "placed" && existing.response) return NextResponse.json({ order: existing.response, duplicate: true });
        return NextResponse.json({ error: "This order submission is already being processed. Check the supplier order status before trying again." }, { status: 409 });
      }
      if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 });
      let order: Record<string, unknown>;
      try {
        order = await placeAtdOrder(orderRequest);
      } catch (orderError) {
        await admin.from("supplier_orders").update({ status: "failed", response: { error: orderError instanceof Error ? orderError.message : "Supplier order failed" } }).eq("request_id", requestId);
        throw orderError;
      }
      const orderObject = (order.order || {}) as Record<string, unknown>;
      const { error: recordError } = await admin.from("supplier_orders").update({
        order_total: Number(orderObject.ordertotal || 0),
        confirmation_number: String(orderObject.confirmationnumber || "") || null,
        status: "placed", response: order,
      }).eq("request_id", requestId);
      return NextResponse.json({ order, warning: recordError ? `The supplier accepted the order, but its app record needs attention: ${recordError.message}` : null });
    }
    if (body.action === "size") return NextResponse.json({ products: await searchAtdBySize(String(body.query || ""), includeCost), sandbox: atdEnvironment !== "production" });
    if (body.action === "fitment-products") return NextResponse.json({ products: await searchAtdByFitment(body.vehicle || {}, includeCost), sandbox: atdEnvironment !== "production" });
    if (["years", "makes", "models", "trims", "options"].includes(body.action)) return NextResponse.json(await fitmentList(body.action, body.selection || {}));
    return NextResponse.json({ error: "Invalid supplier action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Supplier request failed" }, { status: 502 });
  }
}
