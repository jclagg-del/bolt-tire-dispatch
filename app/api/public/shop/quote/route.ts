import { NextResponse } from "next/server";
import { searchAtdBySize } from "@/lib/atd";
import { fallbackBusinessSettings, installationDefault, type BusinessSettings } from "@/lib/business-settings";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim();
    const query = String(body.query || "").replace(/[^0-9]/g, "");
    const productId = String(body.productId || "");
    const quantity = Math.min(6, Math.max(1, Number(body.quantity) || 4));
    if (!name || (!phone && !email)) return NextResponse.json({ error: "Enter your name and a phone number or email." }, { status: 400 });
    if (!query || !productId) return NextResponse.json({ error: "Choose a valid tire." }, { status: 400 });

    const product = (await searchAtdBySize(query, false)).find((item) => item.id === productId);
    if (!product) return NextResponse.json({ error: "That tire is no longer available. Please search again." }, { status: 409 });
    const admin = createAdminClient();
    const { data: savedSettings } = await admin.from("business_settings").select("*").eq("id", true).maybeSingle();
    const settings = { ...fallbackBusinessSettings, ...(savedSettings || {}) } as BusinessSettings;
    const category = product.serviceCategory as "passenger" | "truck";
    const disposalEach = category === "truck" ? settings.truck_disposal_fee : settings.passenger_disposal_fee;
    const { data: quote, error } = await admin.from("quotes").insert({
      status: "approved", customer: name, contact_name: name, phone: phone || null, email: email || null,
      vehicle: String(body.vehicle || "").trim() || null, address: String(body.address || "").trim() || null,
      tire_size: product.size || query, quantity, service_category: category,
      installation_cost: installationDefault(settings, quantity, category), service_call_fee: 0,
      disposal_fee: disposalEach * quantity, ny_state_tire_fee: settings.ny_state_tire_fee * quantity,
      sales_tax_rate: settings.default_sales_tax_rate, tax_exempt: false,
      notes: "Created from the public Tire Shop.",
    }).select("id,public_token").single();
    if (error || !quote) throw new Error(error?.message || "Could not create quote");
    const stock = product.availability.local || product.availability.localPlus;
    const { data: option, error: optionError } = await admin.from("quote_options").insert({
      quote_id: quote.id, tier: "better", brand: product.brand, model: product.model,
      image_url: product.imageUrl, price_per_tire: product.quotePrice,
      warranty_miles: Number((product.warranty.match(/[\d,]+/)?.[0] || "0").replace(/,/g, "")) || null,
      tire_type: product.category, load_speed_rating: product.loadSpeed || null,
      snow_rating: product.snowRated ? "3PMSF" : null, availability: stock ? `In stock (${stock})` : "Special order",
      recommended: true, sort_order: 0,
    }).select("id").single();
    if (optionError || !option) { await admin.from("quotes").delete().eq("id", quote.id); throw new Error(optionError?.message || "Could not add tire"); }
    await admin.from("quotes").update({ selected_option_id: option.id }).eq("id", quote.id);
    return NextResponse.json({ token: quote.public_token });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create quote" }, { status: 500 });
  }
}
