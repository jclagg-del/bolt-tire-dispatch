import "server-only";

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
  if (!response.ok) throw new Error(typeof payload?.errorMessage === "string" ? payload.errorMessage : `ATD request failed (${response.status})`);
  return payload as T;
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
};

type InventoryProduct = { local?: number; localplus?: number; nationwide?: number; onhand?: number; atdproductnumber: string };

function firstImage(product: AtdProduct) {
  for (const group of Object.values(product.images || {})) {
    const image = group?.image?.[0]?.url || group?.images?.[0]?.url;
    if (image) return image;
  }
  return null;
}

function customerPrice(cost: number, productGroup = "") {
  const truck = productGroup.toLowerCase().includes("truck");
  const installationPerTire = (truck ? 325 : 275) / 4;
  const disposal = truck ? 12 : 7;
  return Math.ceil(cost * 1.25 + installationPerTire + disposal + 2.5);
}

async function inventoryFor(products: AtdProduct[]) {
  const ids = products.map((product) => product.atdproductnumber).filter(Boolean);
  if (!ids.length) return new Map<string, InventoryProduct>();
  const response = await atdRequest<{ products?: InventoryProduct[] }>("product/product-availability", {
    locationnumber: locationNumber,
    criteria: { atdproductnumber: ids },
  });
  return new Map((response.products || []).map((item) => [item.atdproductnumber, item]));
}

function presentProducts(products: AtdProduct[], inventory: Map<string, InventoryProduct>, includeCost: boolean) {
  return products.filter((product) => !product.replaced).map((product) => {
    const stock = inventory.get(product.atdproductnumber);
    const cost = Number(product.price?.cost || 0);
    return {
      id: product.atdproductnumber,
      atdProductNumber: product.atdproductnumber,
      manufacturerProductNumber: product.mfgproductnumber || "",
      brand: product.brand || "Unknown brand",
      model: product.style || "Tire",
      description: product.description || "",
      size: product.productspec?.size || product.description?.split(" ")[0] || "",
      category: product.productspec?.seasonaldesignation || product.productgroup || "Tire",
      loadSpeed: [product.productspec?.loadindex, product.productspec?.speedrating].filter(Boolean).join(" "),
      warranty: product.productspec?.mileagewarranty || "",
      snowRated: (product.productspec?.winterdesignation || "").toLowerCase().includes("snowflake"),
      runFlat: product.productspec?.runflat === "Y",
      loadRange: product.productspec?.loadrange || "",
      imageUrl: firstImage(product),
      discontinued: Boolean(product.discontinued),
      installedPrice: customerPrice(cost, product.productgroup),
      ...(includeCost ? { cost, map: Number(product.price?.map || 0), msrp: Number(product.price?.msrp || 0) } : {}),
      availability: { local: stock?.local || 0, localPlus: stock?.localplus || 0, nationwide: stock?.nationwide || 0 },
    };
  });
}

export async function searchAtdBySize(query: string, includeCost: boolean) {
  const keywords = query.replace(/[^0-9]/g, "");
  const response = await atdRequest<{ products?: AtdProduct[] }>("product/product-by-keyword", {
    locationnumber: locationNumber,
    keywords,
    options: {
      price: { cost: 1, map: 1, msrp: 1 },
      images: { small: 1 },
      productspec: {},
    },
  });
  const products = (response.products || []).slice(0, 30);
  return presentProducts(products, await inventoryFor(products), includeCost);
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
    options: { price: { cost: 1, map: 1, msrp: 1 }, images: { small: 1 }, productspec: {} },
  });
  const products = (response.fitments || []).flatMap((fitment) => (fitment.fitmentresults || []).flatMap((result) => Object.values(result.position || {}).flatMap((position) => position.products || []))).slice(0, 30);
  return presentProducts(products, await inventoryFor(products), includeCost);
}
