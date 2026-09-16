import { NextResponse } from "next/server";
import { searchAtdBySize } from "@/lib/atd";
import { searchUsafBySize } from "@/lib/usaf-catalog";
import { fallbackBusinessSettings, installationDefault, type BusinessSettings } from "@/lib/business-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { availableShopTimes } from "@/lib/shop-availability";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim();
    const query = String(body.query || "").replace(/[^0-9]/g, "");
    const productId = String(body.productId || "");
    const quantity = Math.min(6, Math.max(1, Number(body.quantity) || 4));
    const installationSelected = body.service !== "tires_only";
    const requestedDate = String(body.requestedDate || "").trim();
    const requestedTime = String(body.requestedTime || "").trim().substring(0, 5);
    if (!name || (!phone && !email)) return NextResponse.json({ error: "Enter your name and a phone number or email." }, { status: 400 });
    if (!query || !productId) return NextResponse.json({ error: "Choose a valid tire." }, { status: 400 });
    if (installationSelected) {
      if (!String(body.address || "").trim() || !requestedDate || !requestedTime) return NextResponse.json({ error: "Choose an appointment and enter the service address." }, { status: 400 });
      const times = await availableShopTimes(requestedDate);
      if (!times.some((item) => item.value === requestedTime)) return NextResponse.json({ error: "That appointment is no longer available. Please choose another time." }, { status: 409 });
    }

    const requested = Array.isArray(body.selections) && body.selections.length > 1 ? body.selections.slice(0, 2) : [{ productId, size: query, position: "both" }];
    const verified = await Promise.all(requested.map(async (selection: {productId:string;size:string;position:string}) => {
      // Server-side verification may include cost; it is stored for staff ordering and never returned to the shopper.
      const products = (await Promise.all([
        searchAtdBySize(String(selection.size || query), true),
        searchUsafBySize(String(selection.size || query), true),
      ])).flat();
      const product = products.find((item) => item.id === String(selection.productId));
      return product ? { ...product, requestedPosition: selection.position } : null;
    }));
    const products = verified.filter(Boolean) as Array<NonNullable<(typeof verified)[number]>>;
    if (products.length !== requested.length) return NextResponse.json({ error: "One of those tires is no longer available. Please search again." }, { status: 409 });
    const staggered = products.length === 2 && products.some((item) => item.requestedPosition === "front") && products.some((item) => item.requestedPosition === "rear");
    const product = products[0];
    const front = products.find((item) => item.requestedPosition === "front") || product;
    const rear = products.find((item) => item.requestedPosition === "rear") || null;
    const admin = createAdminClient();
    const { data: savedSettings } = await admin.from("business_settings").select("*").eq("id", true).maybeSingle();
    const settings = { ...fallbackBusinessSettings, ...(savedSettings || {}) } as BusinessSettings;
    const category = products.some((item) => item.serviceCategory === "truck") ? "truck" : "passenger";
    const quoteQuantity = staggered ? 4 : quantity;
    const disposalEach = category === "truck" ? settings.truck_disposal_fee : settings.passenger_disposal_fee;
    const { data: quote, error } = await admin.from("quotes").insert({
      status: "approved", customer: name, contact_name: name, phone: phone || null, email: email || null,
      vehicle: String(body.vehicle || "").trim() || null, address: String(body.address || "").trim() || null,
      tire_size: front.size || query, quantity: staggered ? 2 : quoteQuantity,
      rear_tire_size: staggered ? rear?.size || null : null, rear_quantity: staggered ? 2 : null, service_category: category,
      installation_cost: installationSelected ? installationDefault(settings, quoteQuantity, category) : 0, service_call_fee: 0,
      disposal_fee: installationSelected ? disposalEach * quoteQuantity : 0, ny_state_tire_fee: settings.ny_state_tire_fee * quoteQuantity,
      sales_tax_rate: settings.default_sales_tax_rate, tax_exempt: false,
      purchase_source: "website", requested_date: installationSelected ? requestedDate : null,
      requested_time: installationSelected ? requestedTime : null,
      appointment_hold_expires_at: installationSelected ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
      notes: `Created from the public Tire Shop. Service: ${installationSelected ? "mobile installation" : "tires only"}.`,
    }).select("id,public_token").single();
    if (error || !quote) throw new Error(error?.message || "Could not create quote");
    const stock = Math.min(...products.map((item) => item.availability.local || item.availability.localPlus));
    const { data: option, error: optionError } = await admin.from("quote_options").insert({
      quote_id: quote.id, tier: "better", brand: front.brand, model: front.model,
      image_url: front.imageUrl, price_per_tire: front.quotePrice,
      warranty_miles: (()=>{const value=Number((front.warranty.match(/[\d,]+/)?.[0]||"0").replace(/,/g,""));return value*(/k/i.test(front.warranty)?1000:1)||null})(),
      tire_type: front.category, load_speed_rating: front.loadSpeed || null,
      snow_rating: front.snowRated ? "3PMSF" : null, availability: stock ? `In stock (${stock})` : "Special order",
      highlights: front.rebates?.length ? front.rebates.map((rebate: { description: string }) => rebate.description).join(" · ") : null,
      supplier: front.supplier, supplier_product_id: front.atdProductNumber,
      manufacturer_product_id: front.manufacturerProductNumber || null,
      wholesale_cost: front.cost || null, supplier_availability: front.availability,
      rear_brand: staggered ? rear?.brand || null : null,
      rear_model: staggered ? rear?.model || null : null,
      rear_image_url: staggered ? rear?.imageUrl || null : null,
      rear_price_per_tire: staggered ? rear?.quotePrice || null : null,
      rear_supplier: staggered ? rear?.supplier || null : null,
      rear_supplier_product_id: staggered ? rear?.atdProductNumber || null : null,
      rear_manufacturer_product_id: staggered ? rear?.manufacturerProductNumber || null : null,
      rear_wholesale_cost: staggered ? rear?.cost || null : null,
      recommended: false, sort_order: 0,
    }).select("id").single();
    if (optionError || !option) { await admin.from("quotes").delete().eq("id", quote.id); throw new Error(optionError?.message || "Could not add tire"); }
    await admin.from("quotes").update({ selected_option_id: option.id }).eq("id", quote.id);
    return NextResponse.json({ token: quote.public_token });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create quote" }, { status: 500 });
  }
}
