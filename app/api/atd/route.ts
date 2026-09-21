import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { atdEnvironment, fitmentList, placeAtdOrder, previewAtdOrder, searchAtdByFitment, searchAtdByPartNumber, searchAtdBySize } from "@/lib/atd";
import { searchUsafByPartNumber, searchUsafBySize } from "@/lib/usaf-catalog";
import { ntwEnvironment, searchNtwByPartNumber, searchNtwBySize } from "@/lib/ntw";
import { auditSupplierMatches } from "@/lib/inventory-match-audit";
import { enrichWithTireLibrary, sanitizeVehicleFitments, tireLibraryFitmentList, tireLibraryFitmentSize, tireLibraryStatus, tireLibraryTireDetails } from "@/lib/tire-library";

async function staffAuthorized(request: NextRequest) {
  return requireApiUser(request);
}

async function optionalNtw<T>(request: () => Promise<T[]>) {
  try {
    return await request();
  } catch (error) {
    const cause = error instanceof Error && "cause" in error
      ? error.cause as { code?: string; message?: string } | undefined
      : undefined;
    console.warn(
      "NTW inventory lookup failed; continuing with other suppliers:",
      error instanceof Error ? error.message : error,
      cause?.code || cause?.message || "",
    );
    return [];
  }
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
    if (body.action === "tire-library-status") {
      if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return NextResponse.json(await tireLibraryStatus());
    }
    if (body.action === "tire-details") {
      const id = Number(body.tireLibraryId);
      return NextResponse.json({ details: await tireLibraryTireDetails(id) });
    }
    if (body.action === "size") {
      const query = String(body.query || "");
      const [atdProducts, usafProducts, ntwProducts] = await Promise.all([
        searchAtdBySize(query, includeCost),
        searchUsafBySize(query, includeCost),
        ntwEnvironment === "production" || includeCost ? optionalNtw(() => searchNtwBySize(query, includeCost)) : Promise.resolve([]),
      ]);
      const products = await enrichWithTireLibrary([...atdProducts, ...usafProducts, ...ntwProducts]);
      if (includeCost) await auditSupplierMatches(products);
      return NextResponse.json({ products, sandbox: atdEnvironment !== "production" });
    }
    if (body.action === "part-number") {
      if (!includeCost) return NextResponse.json({ error: "Staff access is required." }, { status: 401 });
      const query = String(body.query || "");
      const [atdProducts, usafProducts, ntwProducts] = await Promise.all([
        searchAtdByPartNumber(query, true),
        searchUsafByPartNumber(query, true),
        optionalNtw(() => searchNtwByPartNumber(query, true)),
      ]);
      const products = await enrichWithTireLibrary([...atdProducts, ...usafProducts, ...ntwProducts]);
      if (includeCost) await auditSupplierMatches(products);
      return NextResponse.json({ products, sandbox: atdEnvironment !== "production" });
    }
    if (body.action === "fitment-products") {
      const fitments = sanitizeVehicleFitments(body.vehicle?.fitments);
      if (!fitments.length) {
        const fallback = await searchAtdByFitment(body.vehicle || {}, includeCost);
        return NextResponse.json({ products: await enrichWithTireLibrary(fallback), sandbox: atdEnvironment !== "production" });
      }
      const groups = await Promise.all(fitments.map(async (fitment) => {
        const size = tireLibraryFitmentSize(fitment);
        const [atdProducts, usafProducts, ntwProducts] = await Promise.all([
          searchAtdBySize(size, includeCost),
          searchUsafBySize(size, includeCost),
          ntwEnvironment === "production" || includeCost ? optionalNtw(() => searchNtwBySize(size, includeCost)) : Promise.resolve([]),
        ]);
        const minimumLoad = Number(fitment.load_rating || 0);
        return [...atdProducts, ...usafProducts, ...ntwProducts]
          .filter((product) => {
            if (!minimumLoad || product.supplier === "USAF" || product.supplier === "NTW") return true;
            const productLoad = Number(product.loadSpeed.match(/\b\d{2,3}\b/)?.[0] || 0);
            return !productLoad || productLoad >= minimumLoad;
          })
          .map((product) => ({ ...product, fitmentPosition: fitment.position }));
      }));
      const products = await enrichWithTireLibrary(groups.flat());
      if (includeCost) await auditSupplierMatches(products);
      return NextResponse.json({ products, sandbox: atdEnvironment !== "production" });
    }
    if (["years", "makes", "models", "trims", "options"].includes(body.action)) {
      try {
        return NextResponse.json(await tireLibraryFitmentList(body.action, body.selection || {}));
      } catch (error) {
        console.warn("Tire Library fitment lookup failed; using supplier fitment:", error instanceof Error ? error.message : error);
        return NextResponse.json(await fitmentList(body.action, body.selection || {}));
      }
    }
    return NextResponse.json({ error: "Invalid supplier action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Supplier request failed" }, { status: 502 });
  }
}
