import "server-only";

const baseUrl = (process.env.TIRE_LIBRARY_BASE_URL || "https://api.tireweblibrary.com/api/v1").replace(/\/$/, "");

type TireLibrarySearchResult = {
  id: number;
  name?: string | null;
  item_number?: string | null;
  make_name?: string | null;
  model_name?: string | null;
  width?: string | null;
  aspect_ratio?: string | null;
  rim_size?: string | null;
  load_rating?: string | null;
  speed_rating?: string | null;
  season?: string | null;
  category?: string | null;
  warranty?: string | null;
  ply_rating?: string | null;
  load_range?: string | null;
  utqg?: string | null;
  tread_depth?: string | null;
  terrain?: string | null;
  three_pmsf?: boolean;
  run_flat?: boolean;
  mud_and_snow?: boolean;
  thumbnail_image?: string | null;
};

type TireLibraryPage = {
  data?: TireLibrarySearchResult[];
  current_page?: number;
  last_page?: number;
};

export type EnrichableTire = {
  brand: string;
  model: string;
  size: string;
  manufacturerProductNumber?: string;
  atdProductNumber?: string;
  imageUrl?: string | null;
  category?: string;
  loadSpeed?: string;
  warranty?: string;
  snowRated?: boolean;
  loadRange?: string;
  treadDepth?: string;
  utqg?: string;
  runFlat?: boolean;
};

function apiKey() {
  return process.env.TIRE_LIBRARY_API_KEY?.trim() || "";
}

async function tireLibraryRequest<T>(path: string): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("Tire Library API key is not configured");
  const response = await fetch(`${baseUrl}/${path.replace(/^\//, "")}`, {
    headers: { "x-api-key": key, Accept: "application/json" },
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!response.ok) throw new Error(`Tire Library request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function sizeParts(value: string) {
  const normalized = value.toUpperCase().replace(/\s/g, "");
  const conventional = normalized.match(/(?:LT|P)?(\d{3})\/?(\d{2,3})(?:ZR|R)(\d{2}(?:\.5)?)/);
  if (conventional) return { width: conventional[1], aspect: conventional[2], rim: conventional[3] };
  const digits = normalized.replace(/\D/g, "");
  const compact = digits.match(/^(\d{3})(\d{2})(\d{2})$/);
  return compact ? { width: compact[1], aspect: compact[2], rim: compact[3] } : null;
}

function normalize(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findMatch(product: EnrichableTire, catalog: TireLibrarySearchResult[]) {
  const productIds = [product.manufacturerProductNumber, product.atdProductNumber].map(normalize).filter(Boolean);
  const brand = normalize(product.brand);
  const model = normalize(product.model);
  return catalog.find((item) => {
    const itemNumber = normalize(item.item_number);
    if (itemNumber && productIds.includes(itemNumber)) return true;
    const libraryBrand = normalize(item.make_name);
    const libraryModel = normalize(item.model_name);
    if (!brand || brand !== libraryBrand || !model || !libraryModel) return false;
    return model === libraryModel || (model.length >= 6 && (model.includes(libraryModel) || libraryModel.includes(model)));
  });
}

async function searchBySize(size: string) {
  const parts = sizeParts(size);
  if (!parts) return [];
  const params = new URLSearchParams({
    width: parts.width,
    aspect_ratio: parts.aspect,
    rim_size: parts.rim,
    per_page: "100",
  });
  const first = await tireLibraryRequest<TireLibraryPage>(`tires/search?${params}`);
  const results = [...(first.data || [])];
  const pages = Math.min(Number(first.last_page || 1), 5);
  for (let page = 2; page <= pages; page += 1) {
    params.set("page", String(page));
    const next = await tireLibraryRequest<TireLibraryPage>(`tires/search?${params}`);
    results.push(...(next.data || []));
  }
  return results;
}

export async function enrichWithTireLibrary<T extends EnrichableTire>(products: T[]): Promise<T[]> {
  if (!apiKey() || !products.length) return products;
  try {
    const sizes = Array.from(new Set(products.map((product) => product.size).filter(Boolean))).slice(0, 4);
    const catalogs = (await Promise.all(sizes.map(searchBySize))).flat();
    return products.map((product) => {
      const match = findMatch(product, catalogs);
      if (!match) return product;
      return {
        ...product,
        brand: match.make_name || product.brand,
        model: match.model_name || product.model,
        imageUrl: match.thumbnail_image || product.imageUrl || null,
        category: match.terrain || match.season || match.category || product.category,
        loadSpeed: [match.load_rating, match.speed_rating].filter(Boolean).join(" ") || product.loadSpeed,
        warranty: match.warranty || product.warranty,
        snowRated: Boolean(match.three_pmsf || product.snowRated),
        loadRange: match.load_range || product.loadRange,
        treadDepth: match.tread_depth || product.treadDepth,
        utqg: match.utqg || product.utqg,
        runFlat: Boolean(match.run_flat || product.runFlat),
        tireLibraryId: match.id,
        tireLibraryItemNumber: match.item_number || null,
        tireLibraryMatched: true,
      };
    });
  } catch (error) {
    console.warn("Tire Library enrichment skipped:", error instanceof Error ? error.message : error);
    return products;
  }
}

export async function tireLibraryStatus() {
  if (!apiKey()) return { configured: false, connected: false };
  try {
    await tireLibraryRequest<TireLibraryPage>("tires/search?width=205&aspect_ratio=65&rim_size=15&per_page=1");
    return { configured: true, connected: true };
  } catch (error) {
    return { configured: true, connected: false, error: error instanceof Error ? error.message : "Connection failed" };
  }
}
