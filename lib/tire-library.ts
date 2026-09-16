import "server-only";

const baseUrls = Array.from(new Set([
  process.env.TIRE_LIBRARY_BASE_URL?.trim(),
  "https://app.tireweblibrary.com/api/v1",
].filter((value): value is string => Boolean(value)).map((value) => value.replace(/\/$/, ""))));

type TireLibrarySearchResult = {
  id: number;
  tire_model_id?: number | null;
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

type TireLibraryRebateSummary = {
  id: number;
  name?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  global?: boolean;
  status?: string | null;
};

type TireLibraryRebateDetail = TireLibraryRebateSummary & {
  image_url?: string | null;
  image_horizontal_url?: string | null;
  image_preview_url?: string | null;
  form_url?: string | null;
  rebate_items?: Array<{
    amount?: number | null;
    amount_reason?: string | null;
    amount_two?: number | null;
    amount_two_reason?: string | null;
    quantity_required?: number | null;
    tire_patterns?: Array<{ id: number; name?: string | null }>;
  }>;
};

type TireLibraryTireDetail = TireLibrarySearchResult & {
  load_capacity_dual?: string | null;
  load_capacity_single?: string | null;
  max_inflation_pressure?: string | null;
  revolutions_per_mile?: string | null;
  rolling_circumference?: string | null;
  diameter_overall?: string | null;
  sidewall?: string | null;
  section_width?: string | null;
  weight?: string | null;
  angle_image?: string | null;
  front_image?: string | null;
  side_image?: string | null;
  side2_image?: string | null;
  image_0100?: string | null;
  image_0200?: string | null;
  image_0301?: string | null;
  image_0302?: string | null;
  tire_make?: { id?: number; name?: string | null; image_url?: string | null } | null;
  tire_model?: {
    id?: number;
    name?: string | null;
    image_url?: string | null;
    image_360_url?: string | null;
    image_360_thumbnail_url?: string | null;
    video_url?: string | null;
    manufacturer_url?: string | null;
    features?: string | null;
    benefits?: string | null;
    description?: string | null;
  } | null;
  rebates?: TireLibraryRebateSummary[];
};

type TireLibraryPatternDetail = {
  id?: number;
  name?: string | null;
  image_url?: string | null;
  image_360_url?: string | null;
  image_360_thumbnail_url?: string | null;
};

export type TireLibraryVehicleFitment = {
  name?: string | null;
  position?: string | null;
  width?: string | null;
  aspect_ratio?: string | null;
  rim_size?: string | null;
  load_rating?: string | null;
  speed_rating?: string | null;
};

type TireLibraryVehicleResponse = {
  endpoint?: string;
  options?: string[] | null;
  fitments?: TireLibraryVehicleFitment[] | null;
};

type TireLibraryPage<T = TireLibrarySearchResult> = {
  data?: T[];
  current_page?: number;
  last_page?: number;
};

export type EnrichableTire = {
  id: string;
  supplier?: string;
  brand: string;
  model: string;
  size: string;
  description?: string;
  manufacturerProductNumber?: string;
  atdProductNumber?: string;
  cost?: number;
  imageUrl?: string | null;
  category?: string;
  loadSpeed?: string;
  warranty?: string;
  snowRated?: boolean;
  loadRange?: string;
  treadDepth?: string;
  utqg?: string;
  runFlat?: boolean;
  sidewall?: string;
  maxLoad?: string;
  maxLoadDual?: string;
  maxPressure?: string;
  revolutionsPerMile?: string;
  diameter?: string;
  sectionWidth?: string;
  weight?: string;
  hasRebate?: boolean;
  rebates?: Array<{ code: string; description: string; url?: string }>;
};

function apiKey() {
  return process.env.TIRE_LIBRARY_API_KEY?.trim() || "";
}

async function tireLibraryRequest<T>(path: string): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("Tire Library API key is not configured");
  let lastError = "Tire Library request failed";
  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/${path.replace(/^\//, "")}`, {
        headers: { "x-api-key": key, Accept: "application/json" },
        next: { revalidate: 60 * 60 * 12 },
      });
      if (response.ok) return response.json() as Promise<T>;
      lastError = `Tire Library request failed (${response.status})`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Tire Library connection failed";
    }
  }
  throw new Error(lastError);
}

function safeUrl(value: string | null | undefined) {
  return /^https:\/\//i.test(value || "") ? String(value) : "";
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

function normalizeBrand(value: string | null | undefined) {
  return normalize(value)
    .replace(/(?:tires?|tyres?)$/, "")
    .replace(/(?:rubber|company|corp|corporation|incorporated|inc)$/, "");
}

function normalizeModel(value: string | null | undefined, brand?: string | null) {
  let model = normalize(value);
  const normalizedBrand = normalizeBrand(brand);
  if (normalizedBrand && model.startsWith(normalizedBrand)) model = model.slice(normalizedBrand.length);
  return model.replace(/(?:tires?|tyres?)$/, "");
}

function findMatch(product: EnrichableTire, catalog: TireLibrarySearchResult[]) {
  const productIds = [product.manufacturerProductNumber, product.atdProductNumber].map(normalize).filter(Boolean);
  const brand = normalizeBrand(product.brand);
  const model = normalizeModel(product.model, product.brand);
  const exactIdentifier = catalog.find((item) => {
    const itemNumber = normalize(item.item_number);
    return Boolean(itemNumber && productIds.includes(itemNumber));
  });
  if (exactIdentifier) return exactIdentifier;
  return catalog.find((item) => {
    const libraryBrand = normalizeBrand(item.make_name);
    const libraryModel = normalizeModel(item.model_name, item.make_name);
    const sameBrand = brand === libraryBrand || (Math.min(brand.length, libraryBrand.length) >= 4 && (brand.includes(libraryBrand) || libraryBrand.includes(brand)));
    if (!sameBrand || !model || !libraryModel) return false;
    return model === libraryModel || (Math.min(model.length, libraryModel.length) >= 5 && (model.includes(libraryModel) || libraryModel.includes(model)));
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
  // A common truck size can contain well over 500 catalog entries. Stopping
  // after five pages leaves otherwise valid supplier products unmatched, so
  // walk the complete size result set. The API caps each page at 100.
  const pages = Number(first.last_page || 1);
  for (let page = 2; page <= pages; page += 1) {
    params.set("page", String(page));
    const next = await tireLibraryRequest<TireLibraryPage>(`tires/search?${params}`);
    results.push(...(next.data || []));
  }
  return results;
}

async function activeRebatesByPattern() {
  const first = await tireLibraryRequest<TireLibraryPage<TireLibraryRebateSummary>>("rebate?status=Active&per_page=100");
  const summaries = first.data || [];
  const details = await Promise.all(summaries.slice(0, 90).map(async (rebate) => {
    try {
      return await tireLibraryRequest<TireLibraryRebateDetail>(`rebate/${rebate.id}`);
    } catch {
      return null;
    }
  }));
  const byPattern = new Map<number, Array<{ code: string; description: string; url: string }>>();
  for (const rebate of details) {
    if (!rebate || String(rebate.status || "").toLowerCase() !== "active") continue;
    for (const item of rebate.rebate_items || []) {
      const amounts = [item.amount, item.amount_two].filter((amount): amount is number => Number(amount) > 0);
      const savings = amounts.length ? ` — up to $${Math.max(...amounts).toFixed(0)}` : "";
      const quantity = item.quantity_required ? ` on ${item.quantity_required} tires` : "";
      const description = `${rebate.name || rebate.description || "Manufacturer rebate"}${savings}${quantity}`;
      const entry = {
        code: String(rebate.id),
        description,
        url: safeUrl(rebate.form_url) || safeUrl(rebate.image_preview_url) || safeUrl(rebate.image_url),
      };
      for (const pattern of item.tire_patterns || []) {
        const existing = byPattern.get(pattern.id) || [];
        if (!existing.some((candidate) => candidate.code === entry.code)) existing.push(entry);
        byPattern.set(pattern.id, existing);
      }
    }
  }
  return byPattern;
}

function basePatternName(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[\s-]+(?:LT|P-Metric|LT-Metric)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function tireLibraryPatternImage(id: number, name?: string | null) {
  if (!Number.isInteger(id) || id < 1) return "";
  const pattern = await tireLibraryRequest<TireLibraryPatternDetail>(`tire-patterns/${id}`);
  const direct = safeUrl(pattern.image_url) || safeUrl(pattern.image_360_thumbnail_url) || safeUrl(pattern.image_360_url);
  if (direct) return direct;
  const search = basePatternName(name || pattern.name);
  if (!search) return "";
  const related = await tireLibraryRequest<TireLibraryPatternDetail[]>(`tire-patterns?search=${encodeURIComponent(search)}`);
  const searchKey = normalizeModel(search);
  const candidate = related.find((item) => normalizeModel(basePatternName(item.name)) === searchKey && safeUrl(item.image_url))
    || related.find((item) => safeUrl(item.image_url));
  return safeUrl(candidate?.image_url) || safeUrl(candidate?.image_360_thumbnail_url) || safeUrl(candidate?.image_360_url);
}

export async function enrichWithTireLibrary<T extends EnrichableTire>(products: T[]): Promise<T[]> {
  if (!apiKey() || !products.length) return products;
  try {
    const sizes = Array.from(new Set(products.map((product) => product.size).filter(Boolean))).slice(0, 4);
    const [catalogs, rebatesByPattern] = await Promise.all([
      Promise.all(sizes.map(searchBySize)).then((groups) => groups.flat()),
      activeRebatesByPattern().catch(() => new Map<number, Array<{ code: string; description: string; url: string }>>()),
    ]);
    const matches = products.map((product) => findMatch(product, catalogs));
    const imageByModel = new Map<number, string>();
    for (const item of catalogs) {
      const key = Number(item.tire_model_id || item.id);
      const image = safeUrl(item.thumbnail_image);
      if (image && !imageByModel.has(key)) imageByModel.set(key, image);
    }
    const representativeByModel = new Map<number, TireLibrarySearchResult>();
    for (const match of matches) {
      if (!match) continue;
      const key = Number(match.tire_model_id || match.id);
      if (!representativeByModel.has(key)) representativeByModel.set(key, match);
    }
    const representativeEntries = Array.from(representativeByModel.entries());
    const needsImage = ([key]: [number, TireLibrarySearchResult]) =>
      !imageByModel.get(key) && matches.some((match, index) =>
        Number(match?.tire_model_id || match?.id) === key &&
        !safeUrl(match?.thumbnail_image) &&
        !safeUrl(products[index]?.imageUrl),
      );
    const prioritizedEntries = [
      ...representativeEntries.filter(needsImage),
      ...representativeEntries.filter((entry) => !needsImage(entry)),
    ];
    const detailPairs = await Promise.all(prioritizedEntries.slice(0, 60).map(async ([key, match]) => {
      try {
        const detail = await tireLibraryTireDetails(match.id);
        if (!detail.imageUrl && match.tire_model_id) {
          detail.imageUrl = await tireLibraryPatternImage(match.tire_model_id, match.model_name).catch(() => "");
        }
        return [key, detail] as const;
      } catch {
        return [key, null] as const;
      }
    }));
    const detailsByModel = new Map(detailPairs);
    return products.map((product, index) => {
      const match = matches[index];
      if (!match) return product;
      const detail = detailsByModel.get(Number(match.tire_model_id || match.id));
      const libraryRebates = match.tire_model_id ? rebatesByPattern.get(match.tire_model_id) || [] : [];
      const rebates: Array<{ code: string; description: string; url?: string }> = [...(product.rebates || [])];
      for (const rebate of libraryRebates) if (!rebates.some((candidate) => candidate.code === rebate.code)) rebates.push(rebate);
      return {
        ...product,
        brand: detail?.brand || match.make_name || product.brand,
        model: detail?.model || match.model_name || product.model,
        description: detail?.description || product.description,
        imageUrl: detail?.imageUrl || safeUrl(match.thumbnail_image) || imageByModel.get(Number(match.tire_model_id || match.id)) || product.imageUrl || null,
        category: detail?.terrain || detail?.season || detail?.category || match.terrain || match.season || match.category || product.category,
        loadSpeed: detail?.loadSpeed || [match.load_rating, match.speed_rating].filter(Boolean).join(" ") || product.loadSpeed,
        warranty: detail?.warranty || match.warranty || product.warranty,
        snowRated: Boolean(detail?.snowRated || match.three_pmsf || product.snowRated),
        loadRange: detail?.loadRange || match.load_range || product.loadRange,
        treadDepth: detail?.treadDepth || match.tread_depth || product.treadDepth,
        utqg: detail?.utqg || match.utqg || product.utqg,
        runFlat: Boolean(detail?.runFlat || match.run_flat || product.runFlat),
        sidewall: detail?.sidewall || product.sidewall,
        maxLoad: detail?.maxLoad || product.maxLoad,
        maxLoadDual: detail?.maxLoadDual || product.maxLoadDual,
        maxPressure: detail?.maxPressure || product.maxPressure,
        revolutionsPerMile: detail?.revolutionsPerMile || product.revolutionsPerMile,
        diameter: detail?.diameter || product.diameter,
        sectionWidth: detail?.sectionWidth || product.sectionWidth,
        weight: detail?.weight || product.weight,
        hasRebate: Boolean(rebates.length || product.hasRebate),
        rebates,
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

function normalizePosition(value: string | null | undefined): "front" | "rear" | "both" {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("front/rear") || normalized.includes("both") || normalized.includes("all")) return "both";
  if (normalized.includes("front") || normalized.includes("steer")) return "front";
  if (normalized.includes("rear") || normalized.includes("drive")) return "rear";
  return "both";
}

export function tireLibraryFitmentSize(fitment: TireLibraryVehicleFitment) {
  if (!fitment.width || !fitment.aspect_ratio || !fitment.rim_size) return "";
  return `${fitment.width}/${fitment.aspect_ratio}R${fitment.rim_size}`;
}

function fitmentLabel(fitment: TireLibraryVehicleFitment) {
  const size = tireLibraryFitmentSize(fitment);
  const service = [fitment.load_rating, fitment.speed_rating].filter(Boolean).join("");
  return [size, service].filter(Boolean).join(" ");
}

function buildFitmentOptions(fitments: TireLibraryVehicleFitment[]) {
  const both = fitments.filter((fitment) => normalizePosition(fitment.position) === "both");
  const fronts = fitments.filter((fitment) => normalizePosition(fitment.position) === "front");
  const rears = fitments.filter((fitment) => normalizePosition(fitment.position) === "rear");
  const groups: TireLibraryVehicleFitment[][] = both.map((fitment) => [fitment]);
  const staggeredCount = Math.max(fronts.length, rears.length);
  for (let index = 0; index < staggeredCount; index += 1) {
    const group = [fronts[index], rears[index]].filter((fitment): fitment is TireLibraryVehicleFitment => Boolean(fitment));
    if (group.length) groups.push(group);
  }
  return groups.map((group, index) => {
    const front = group.find((fitment) => normalizePosition(fitment.position) === "front");
    const rear = group.find((fitment) => normalizePosition(fitment.position) === "rear");
    const standard = group.find((fitment) => normalizePosition(fitment.position) === "both");
    const trimoption = standard
      ? fitmentLabel(standard)
      : [front && `Front ${fitmentLabel(front)}`, rear && `Rear ${fitmentLabel(rear)}`].filter(Boolean).join(" / ");
    return {
      trim: "",
      trimoption,
      vehicleid: `tl-${index}`,
      staggeredfitment: front && rear ? "true" : "false",
      fitments: group.map((fitment) => ({ ...fitment, position: normalizePosition(fitment.position) })),
      position: [{
        ...(standard ? { both: { trimspecs: { Size: tireLibraryFitmentSize(standard) } } } : {}),
        ...(front ? { front: { trimspecs: { Size: tireLibraryFitmentSize(front) } } } : {}),
        ...(rear ? { rear: { trimspecs: { Size: tireLibraryFitmentSize(rear) } } } : {}),
      }],
    };
  });
}

export async function tireLibraryFitmentList(action: string, selection: Record<string, string>) {
  const params = new URLSearchParams();
  for (const key of ["year", "make", "model", "trim"] as const) {
    if (selection[key]) params.set(key, selection[key]);
  }
  const response = await tireLibraryRequest<TireLibraryVehicleResponse>(`vehicle/lookup${params.size ? `?${params}` : ""}`);
  const options = response.options || [];
  if (action === "years") return { years: options };
  if (action === "makes") return { makes: options };
  if (action === "models") return { models: options };
  if (action === "trims") return { trims: options };
  if (action === "options") return { trimoptions: buildFitmentOptions(response.fitments || []) };
  throw new Error("Unknown Tire Library fitment action");
}

export function sanitizeVehicleFitments(value: unknown): Array<TireLibraryVehicleFitment & { position: "front" | "rear" | "both" }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const width = String(item.width || "").replace(/\D/g, "");
    const aspect = String(item.aspect_ratio || "").replace(/\D/g, "");
    const rim = String(item.rim_size || "").replace(/[^0-9.]/g, "");
    if (!width || !aspect || !rim) return [];
    return [{
      width,
      aspect_ratio: aspect,
      rim_size: rim,
      load_rating: String(item.load_rating || "").replace(/[^0-9]/g, ""),
      speed_rating: String(item.speed_rating || "").replace(/[^a-z]/gi, "").toUpperCase(),
      position: normalizePosition(String(item.position || "both")),
    }];
  }).slice(0, 4);
}

export async function tireLibraryTireDetails(id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error("A valid Tire Library tire ID is required");
  const tire = await tireLibraryRequest<TireLibraryTireDetail>(`tires/${id}?rebate_status=Active`);
  return {
    id: tire.id,
    brand: tire.tire_make?.name || tire.make_name || "",
    model: tire.tire_model?.name || tire.model_name || "",
    category: tire.category || "",
    season: tire.season || "",
    terrain: tire.terrain || "",
    warranty: tire.warranty || "",
    loadSpeed: [tire.load_rating, tire.speed_rating].filter(Boolean).join(" "),
    loadRange: tire.load_range || "",
    treadDepth: tire.tread_depth || "",
    utqg: tire.utqg || "",
    snowRated: Boolean(tire.three_pmsf),
    runFlat: Boolean(tire.run_flat),
    imageUrl:
      safeUrl(tire.tire_model?.image_url) ||
      safeUrl(tire.angle_image) ||
      safeUrl(tire.front_image) ||
      safeUrl(tire.side_image) ||
      safeUrl(tire.side2_image) ||
      safeUrl(tire.image_0100) ||
      safeUrl(tire.image_0200) ||
      safeUrl(tire.image_0301) ||
      safeUrl(tire.image_0302) ||
      safeUrl(tire.thumbnail_image),
    image360Url: safeUrl(tire.tire_model?.image_360_url),
    videoUrl: safeUrl(tire.tire_model?.video_url),
    manufacturerUrl: safeUrl(tire.tire_model?.manufacturer_url),
    description: tire.tire_model?.description || "",
    features: tire.tire_model?.features || "",
    benefits: tire.tire_model?.benefits || "",
    maxLoad: tire.load_capacity_single || "",
    maxLoadDual: tire.load_capacity_dual || "",
    maxPressure: tire.max_inflation_pressure || "",
    revolutionsPerMile: tire.revolutions_per_mile || "",
    diameter: tire.diameter_overall || "",
    sectionWidth: tire.section_width || "",
    weight: tire.weight || "",
    sidewall: tire.sidewall || "",
    rebates: (tire.rebates || []).map((rebate) => ({
      code: String(rebate.id),
      description: rebate.name || rebate.description || "Manufacturer rebate",
      url: "",
      startDate: rebate.start_date || "",
      endDate: rebate.end_date || "",
    })),
  };
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
