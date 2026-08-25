import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(...values: unknown[]) {
  const found = values.find((value) => typeof value === "string" && value.trim());
  return typeof found === "string" ? found.trim() : null;
}

export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("supplier_orders")
    .select("id,supplier,atd_product_number,quantity,customer_po_number,customer_comment,order_total,confirmation_number,status,response,created_by,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const creatorIds = [...new Set((data || []).map((row) => row.created_by).filter(Boolean))];
  const creatorNames = new Map<string, string>();
  await Promise.all(creatorIds.map(async (id) => {
    const { data: creator } = await admin.auth.admin.getUserById(id);
    if (creator?.user) creatorNames.set(id, creator.user.email || "Staff member");
  }));

  const orders = (data || []).map((row) => {
    const response = record(row.response);
    const order = record(response.order);
    const lines = records(order.orderlines ?? response.orderlines);
    const line = lines[0] || {};
    const fulfillments = records(line.fulfillments ?? order.fulfillments);
    const fulfillment = fulfillments[0] || {};

    return {
      id: row.id,
      supplier: row.supplier,
      productNumber: row.atd_product_number,
      productDescription: text(line.description, line.productdescription, line.name),
      quantity: row.quantity,
      total: row.order_total,
      confirmationNumber: row.confirmation_number,
      status: row.status,
      poNumber: row.customer_po_number,
      notes: row.customer_comment,
      createdAt: row.created_at,
      placedBy: row.created_by ? creatorNames.get(row.created_by) || "Staff member" : "Staff member",
      fulfillmentStatus: text(fulfillment.status, line.status),
      expectedDelivery: text(fulfillment.estimateddelivery, fulfillment.expecteddelivery, fulfillment.deliverydate),
      source: text(fulfillment.sourcedcname, fulfillment.source, fulfillment.warehouse),
      shipMethod: text(fulfillment.shipmethod, fulfillment.shippingmethod),
    };
  });

  return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
}
