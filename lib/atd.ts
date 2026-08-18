import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fallbackBusinessSettings, installationDefault, type BusinessSettings } from "@/lib/business-settings";

const baseUrl = process.env.ATD_BASE_URL || "https://testws.atdconnect.com/rs/3_6";
const locationNumber = process.env.ATD_LOCATION_NUMBER || "3375509";

function credentials() {
  const username = process.env.ATD_USERNAME;
  const password = process.env.ATD_PASSWORD;
  const clientId = process.env.ATD_CLIENT_ID;
  if (!username || !password || !clientId) throw new Error("ATD sandbox credentials are not configured");
  return { username, password, clientId };
}

async function atdRequest<T>(path: string, body?: unknown): Promise<T> {
  const { username, password, clientId } = credentials();
  for(let attempt=0;attempt<2;attempt++){
    const response = await fetch(`${baseUrl}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        clientId,
        "Content-Type": "application/json",
        "Accept-Language": "en-US",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if(response.ok)return payload as T;
    if(attempt===0&&response.status>=500){await new Promise(resolve=>setTimeout(resolve,350));continue}
    throw new Error(typeof payload?.errorMessage === "string" ? payload.errorMessage : `ATD request failed (${response.status})`);
  }
  throw new Error("ATD is temporarily unavailable");
}

type AtdProduct = {
  atdproductnumber: string;
  mfgproductnumber?: string;
  style?: string;
  brand?: string;
  productgroup?: string;
  description?: string;
  discontinued?: boolean;
  replaced?: boolean;
  price?: { cost?: number; map?: number; msrp?: number };
  images?: Record<string, { image?: Array<{ url?: string }>; images?: Array<{ url?: string }> }>;
  productspec?: Record<string, string>;
  rebates?: Array<{ code?: string; description?: string; url?: string }>;
  fitmentPosition?: "front" | "rear" | "both";
};

type InventoryProduct = { local?: number; localplus?: number; nationwide?: number; onhand?: number; atdproductnumber: string };

function firstImage(product: AtdProduct) {
  for (const group of Object.values(product.images || {})) {
    const image = group?.image?.[0]?.url || group?.images?.[0]?.url;
    if (image) return image;
  }
  return null;
}

function customerPrice(cost: number, productGroup: string, settings: BusinessSettings) {
  const truck = productGroup.toLowerCase().includes("truck");
  const markupPercent = truck ? settings.tire_shop_truck_markup_percent : settings.tire_shop_passenger_markup_percent;
  const minimumProfit = truck ? settings.tire_shop_truck_min_profit : settings.tire_shop_passenger_min_profit;
  const tireProfit = Math.max(cost * (markupPercent / 100), minimumProfit);
  const installationPerTire = (truck ? settings.truck_four_install : settings.passenger_four_install) / 4;
  const disposal = truck ? settings.truck_disposal_fee : settings.passenger_disposal_fee;
  const quotePrice = Math.ceil(cost + tireProfit);
  return { quotePrice, installedPrice: quotePrice + installationPerTire + disposal + settings.ny_state_tire_fee };
}

async function pricingSettings() {
  try {
    const { data, error } = await createAdminClient().from("business_settings").select("*").eq("id", true).maybeSingle();
    if (error || !data) return fallbackBusinessSettings;
    return { ...fallbackBusinessSettings, ...data } as BusinessSettings;
  } catch {
    return fallbackBusinessSettings;
  }
}

async function inventoryFor(products: AtdProduct[]) {
  const ids = products.map((product) => product.atdproductnumber).filter(Boolean);
  if (!ids.length) return new Map<string, InventoryProduct>();
  try{
    const response = await atdRequest<{ products?: InventoryProduct[] }>("product/product-availability", {
      locationnumber: locationNumber,
      criteria: { atdproductnumber: ids },
    });
    return new Map((response.products || []).map((item) => [item.atdproductnumber, item]));
  }catch{return new Map<string,InventoryProduct>()}
}

function presentProducts(products: AtdProduct[], inventory: Map<string, InventoryProduct>, includeCost: boolean, settings: BusinessSettings) {
  return products.filter((product) => !product.replaced).map((product) => {
    const stock = inventory.get(product.atdproductnumber);
    const cost = Number(product.price?.cost || 0);
    const customerPricing = customerPrice(cost, product.productgroup || "", settings);
    const truck = (product.productgroup || "").toLowerCase().includes("truck");
    const disposal = truck ? settings.truck_disposal_fee : settings.passenger_disposal_fee;
    const estimatedTotals = Object.fromEntries([1,2,3,4,5,6].map((quantity) => [quantity, customerPricing.quotePrice * quantity + installationDefault(settings, quantity, truck ? "truck" : "passenger") + disposal * quantity + settings.ny_state_tire_fee * quantity]));
    return {
      id: product.atdproductnumber,
      atdProductNumber: product.atdproductnumber,
      manufacturerProductNumber: product.mfgproductnumber || "",
      brand: product.brand || "Unknown brand",
      model: product.style || "Tire",
      description: product.description || "",
      size: product.productspec?.size || product.description?.split(" ")[0] || "",
      category: product.productspec?.seasonaldesignation || product.productgroup || "Tire",
      serviceCategory: truck ? "truck" : "passenger",
      fitmentPosition: product.fitmentPosition || "both",
      loadSpeed: [product.productspec?.loadindex, product.productspec?.speedrating].filter(Boolean).join(" "),
      warranty: product.productspec?.mileagewarranty || "",
      snowRated: (product.productspec?.winterdesignation || "").toLowerCase().includes("snowflake"),
      loadRange: product.productspec?.loadrange || "",
      imageUrl: firstImage(product),
      discontinued: Boolean(product.discontinued),
      runFlat: product.productspec?.runflat === "Y" || product.productspec?.runflat === "1",
      hasRebate: Boolean(product.rebates?.length),
      quotePrice: customerPricing.quotePrice,
      installedPrice: customerPricing.installedPrice,
      estimatedTotals,
      ...(includeCost ? { cost, map: Number(product.price?.map || 0), msrp: Number(product.price?.msrp || 0) } : {}),
      availability: { local: stock?.local || 0, localPlus: stock?.localplus || 0, nationwide: stock?.nationwide || 0 },
    };
  });
}

type PresentedProduct=ReturnType<typeof presentProducts>[number];

export async function searchAtdBySize(query: string, includeCost: boolean):Promise<PresentedProduct[]> {
  const keywords = query.replace(/[^0-9]/g, "");
  const cacheKey=`${keywords}:${includeCost?"staff":"public"}`;
  try{
    const response = await atdRequest<{ products?: AtdProduct[] }>("product/product-by-keyword", {
      locationnumber: locationNumber,
      keywords,
      options: {
        price: { cost: 1, map: 1, msrp: 1 },
        images: { small: 1 },
        productspec: {},
        includerebates: 1,
        includemarketingprograms: 1,
      },
    });
    const products = (response.products || []).slice(0, 30);
    const presented=presentProducts(products,await inventoryFor(products),includeCost,await pricingSettings());
    if(presented.length)await createAdminClient().from("atd_search_cache").upsert({cache_key:cacheKey,products:presented,cached_at:new Date().toISOString()}).then(()=>{});
    if(!presented.length){const{data}=await createAdminClient().from("atd_search_cache").select("products,cached_at").eq("cache_key",cacheKey).maybeSingle();if(Array.isArray(data?.products)&&data.products.length&&Date.now()-new Date(data.cached_at).getTime()<24*60*60*1000)return data.products as PresentedProduct[]}
    return presented;
  }catch(error){
    const{data}=await createAdminClient().from("atd_search_cache").select("products,cached_at").eq("cache_key",cacheKey).maybeSingle();
    if(Array.isArray(data?.products)&&data.products.length&&Date.now()-new Date(data.cached_at).getTime()<24*60*60*1000)return data.products as PresentedProduct[];
    throw error;
  }
}

export async function fitmentList(action: string, selection: Record<string, string>) {
  const endpoints: Record<string, string> = { years: "year", makes: "make", models: "model", trims: "trim", options: "trim-option" };
  const endpoint = endpoints[action];
  if (!endpoint) throw new Error("Unknown fitment action");
  return atdRequest<Record<string, unknown>>(`fitment/${endpoint}`, action === "years" ? {} : selection);
}

export async function searchAtdByFitment(vehicle: Record<string, string>, includeCost: boolean) {
  const response = await atdRequest<{ fitments?: Array<{ fitmentresults?: Array<{ position?: Record<string, { products?: AtdProduct[] }> }> }> }>("fitment/product-by-fitment", {
    locationnumber: locationNumber,
    vehicle,
    criteria: { productgroup: ["passenger tires", "light truck tires"] },
    options: { price: { cost: 1, map: 1, msrp: 1 }, images: { small: 1 }, productspec: {}, includerebates: 1, includemarketingprograms: 1 },
  });
  const products = (response.fitments || []).flatMap((fitment) =>
    (fitment.fitmentresults || []).flatMap((result) =>
      Object.entries(result.position || {}).flatMap(([position, group]) =>
        (group.products || []).map((product) => ({ ...product, fitmentPosition: position as "front" | "rear" | "both" }))
      )
    )
  ).slice(0, 60);
  const settings = await pricingSettings();
  const fitmentProducts = presentProducts(products, await inventoryFor(products), includeCost, settings);
  const trimOption = String(vehicle.trimoption || "");
  const factoryFits = Array.from(trimOption.matchAll(/((?:LT|P)?\d{3}\/\d{2}(?:ZR|R)\d{2})(?:\/[A-Z])?\s+(\d{2,3})?/gi)).map((match, index, matches) => ({ size: match[1], load: Number(match[2] || 0), position: matches.length > 1 ? (index === 0 ? "front" : "rear") : "both" } as const));
  if (!factoryFits.length) return fitmentProducts;
  const supplementalGroups = await Promise.all(factoryFits.map(async ({ size, load, position }) => {
    const sizeProducts = await searchAtdBySize(size, includeCost);
    const safeProducts = load ? sizeProducts.filter((item) => Number(item.loadSpeed.match(/\d{2,3}/)?.[0] || 0) >= load) : sizeProducts;
    return safeProducts.map((item) => ({ ...item, fitmentPosition: position }));
  }));
  const combined = Array.from(new Map([...fitmentProducts, ...supplementalGroups.flat()].map((item) => [`${item.fitmentPosition}:${item.id}`, item])).values());
  if (factoryFits.length > 1) return [...combined.filter((item) => item.fitmentPosition === "front").slice(0, 15), ...combined.filter((item) => item.fitmentPosition === "rear").slice(0, 15)];
  return combined.slice(0, 30);
}
