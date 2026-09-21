import "server-only";
import { request as httpsRequest } from "node:https";
import { createAdminClient } from "@/lib/supabase/admin";
import { fallbackBusinessSettings, installationDefault, type BusinessSettings } from "@/lib/business-settings";

const baseUrl = (process.env.NTW_API_URL || "https://tbcservicesqa.tbccorp.com/tbccorp/qa/tbc/api/v2/products/tires").trim();
export const ntwEnvironment = (process.env.NTW_ENVIRONMENT || "qa").trim().toLowerCase();
const localWarehousePattern = new RegExp(process.env.NTW_LOCAL_WAREHOUSE_PATTERN || "Albany", "i");

type NtwMoney = { amount?: string | number; currencyCode?: string };
type NtwAddress = { streetName?: string; city?: string; state?: string; country?: string; zipCode?: string };
type NtwSource = { locationId?: string; quantityAvailable?: number; address?: NtwAddress };
type NtwProduct = {
  productId?: string;
  partNo?: string;
  description?: string;
  brandName?: string;
  modelName?: string;
  speedRating?: string;
  loadRange?: string;
  loadIndexRange?: string;
  treadPattern?: string;
  allTerrain?: string;
  sideWall?: string;
  runFlat?: string;
  lightTruck?: string;
  tireSize?: { diameter?: string; ratio?: string; width?: string };
  estimatedAvailability?: number;
  estimatedDelivery?: string;
  estimatedDeliveryDate?: string;
  productCost?: NtwMoney;
  availableSource?: NtwSource[];
  tireImage?: { url?: string };
};

function configuration() {
  const clientId = process.env.NTW_CLIENT_ID?.trim();
  const clientSecret = process.env.NTW_CLIENT_SECRET;
  const customerId = process.env.NTW_CUSTOMER_ID?.trim();
  const dealerCode = process.env.NTW_DEALER_CODE?.trim();
  if (!clientId || !clientSecret || !customerId) throw new Error("NTW credentials are not configured");
  return { clientId, clientSecret, customerId, dealerCode };
}

function caCertificate() {
  const value = process.env.NTW_CA_CERT?.trim();
  return value ? value.replace(/\\n/g, "\n") : undefined;
}

async function postJson(
  url: URL,
  headers: Record<string, string>,
  body: Record<string, unknown>
) {
  const payload = JSON.stringify(body);
  const ca = caCertificate();

  return new Promise<{ status: number; payload: { product?: NtwProduct[]; message?: string; error?: string } }>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(payload).toString(),
        },
        ca,
        allowPartialTrustChain: Boolean(ca),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => {
          const responseText = Buffer.concat(chunks).toString("utf8");
          let parsed: { product?: NtwProduct[]; message?: string; error?: string } = {};
          try {
            parsed = responseText ? JSON.parse(responseText) : {};
          } catch {
            parsed = { error: responseText || "NTW returned an unreadable response" };
          }
          resolve({ status: response.statusCode || 500, payload: parsed });
        });
      }
    );

    request.setTimeout(20_000, () => request.destroy(new Error("NTW request timed out")));
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

export function ntwConfigured() {
  return Boolean(process.env.NTW_CLIENT_ID?.trim() && process.env.NTW_CLIENT_SECRET && process.env.NTW_CUSTOMER_ID?.trim());
}

async function pricingSettings() {
  const { data } = await createAdminClient().from("business_settings").select("*").eq("id", true).maybeSingle();
  return { ...fallbackBusinessSettings, ...(data || {}) } as BusinessSettings;
}

function parseTireSize(value: string) {
  const normalized = value.toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/(?:LT|P)?(\d{3})\/?(\d{2})(?:ZR|R)?(\d{2})/);
  if (!match) return null;
  return { width: match[1], ratio: match[2], diameter: match[3] };
}

async function ntwRequest(criteria: Record<string, unknown>[], searchType: "ByTireSize" | "ByPartNumber") {
  const { clientId, clientSecret, customerId, dealerCode } = configuration();
  const url = new URL(baseUrl);
  if (dealerCode) url.searchParams.set("dealerCode", dealerCode);
  const response = await postJson(
    url,
    {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-IBM-Client-Id": clientId,
      "X-IBM-Client-Secret": clientSecret,
    },
    {
      customerId,
      isDropShip: false,
      customerType: "external",
      searchType,
      source: "Bolt Tire",
      criteria,
    }
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(response.payload.message || response.payload.error || `NTW request failed (${response.status})`);
  }
  return response.payload.product || [];
}

function addressLabel(address: NtwAddress | undefined) {
  if (!address) return "";
  return [address.streetName, [address.city, address.state].filter(Boolean).join(", "), address.zipCode].filter(Boolean).join(" · ");
}

function warehouseName(source: NtwSource) {
  const location = [source.address?.city, source.address?.state].filter(Boolean).join(", ");
  return location || (source.locationId ? `NTW warehouse ${source.locationId}` : "NTW warehouse");
}

function presentProducts(products: NtwProduct[], includeCost: boolean, settings: BusinessSettings) {
  return products.map((product) => {
    const truck = product.lightTruck === "Y";
    const cost = Number(product.productCost?.amount || 0);
    const markup = truck ? settings.tire_shop_truck_markup_percent : settings.tire_shop_passenger_markup_percent;
    const minimumProfit = truck ? settings.tire_shop_truck_min_profit : settings.tire_shop_passenger_min_profit;
    const quotePrice = Math.ceil(cost + Math.max(cost * markup / 100, minimumProfit));
    const disposal = truck ? settings.truck_disposal_fee : settings.passenger_disposal_fee;
    const estimatedTotals = Object.fromEntries([1, 2, 3, 4, 5, 6].map((quantity) => [
      quantity,
      quotePrice * quantity + installationDefault(settings, quantity, truck ? "truck" : "passenger") + disposal * quantity + settings.ny_state_tire_fee * quantity,
    ]));
    const warehouses = (product.availableSource || []).filter((source) => Number(source.quantityAvailable || 0) > 0).map((source) => {
      const name = warehouseName(source);
      return {
        warehouse: String(source.locationId || name),
        quantity: Number(source.quantityAvailable || 0),
        name,
        address: addressLabel(source.address),
        local: localWarehousePattern.test(`${name} ${addressLabel(source.address)}`),
        estimatedDelivery: product.estimatedDelivery || "",
        estimatedDeliveryDate: product.estimatedDeliveryDate || "",
        shipMethod: "NTW delivery",
      };
    }).sort((a, b) => Number(Boolean(b.local)) - Number(Boolean(a.local)) || a.name.localeCompare(b.name));
    const localQuantity = warehouses.filter((warehouse) => warehouse.local).reduce((sum, warehouse) => sum + warehouse.quantity, 0);
    const nearbyQuantity = warehouses.filter((warehouse) => !warehouse.local).reduce((sum, warehouse) => sum + warehouse.quantity, 0);
    const size = product.tireSize ? `${product.tireSize.width || ""}/${product.tireSize.ratio || ""}R${product.tireSize.diameter || ""}` : "";
    const partNumber = String(product.partNo || product.productId || "");
    return {
      id: `NTW-${partNumber}`,
      supplier: "NTW" as const,
      atdProductNumber: partNumber,
      manufacturerProductNumber: partNumber,
      brand: product.brandName || "Unknown brand",
      model: product.modelName || product.description || "Tire",
      description: product.description || product.modelName || "",
      size,
      category: product.allTerrain || product.treadPattern || "Tire",
      serviceCategory: truck ? "truck" as const : "passenger" as const,
      fitmentPosition: "both" as const,
      loadSpeed: [product.loadIndexRange, product.speedRating].filter(Boolean).join(" "),
      warranty: "",
      snowRated: false,
      loadRange: product.loadRange || "",
      treadDepth: "",
      utqg: "",
      sidewall: product.sideWall || "",
      maxLoad: "",
      rimRange: "",
      oeMarking: "",
      imageUrl: product.tireImage?.url || null,
      discontinued: false,
      runFlat: product.runFlat === "Y",
      hasRebate: false,
      rebates: [],
      quotePrice,
      installedPrice: estimatedTotals[1],
      estimatedTotals,
      ...(includeCost ? { cost, map: 0, msrp: 0 } : {}),
      availability: { local: localQuantity, localPlus: nearbyQuantity, nationwide: localQuantity + nearbyQuantity },
      warehouseInventory: warehouses,
      qaOnly: ntwEnvironment !== "production",
    };
  });
}

export async function searchNtwBySize(query: string, includeCost: boolean) {
  const tireSize = parseTireSize(query);
  if (!tireSize || !ntwConfigured()) return [];
  const [products, settings] = await Promise.all([
    ntwRequest([{ tireSize, requestedQty: 4 }], "ByTireSize"),
    pricingSettings(),
  ]);
  return presentProducts(products, includeCost, settings);
}

export async function searchNtwByPartNumber(query: string, includeCost: boolean) {
  const partNo = query.trim().replace(/[^a-zA-Z0-9-]/g, "");
  if (!partNo || !ntwConfigured()) return [];
  const [products, settings] = await Promise.all([
    ntwRequest([{ partNo, requestedQty: 4 }], "ByPartNumber"),
    pricingSettings(),
  ]);
  return presentProducts(products, includeCost, settings);
}
