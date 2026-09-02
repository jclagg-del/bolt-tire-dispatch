"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  supplier?: "ATD" | "USAF";
  brand: string;
  model: string;
  description: string;
  size: string;
  category: string;
  loadSpeed: string;
  warranty: string;
  cost?: number;
  quotePrice: number;
  installedPrice: number;
  estimatedTotals: Record<string, number>;
  imageUrl: string | null;
  snowRated: boolean;
  loadRange: string;
  treadDepth: string;
  utqg: string;
  sidewall: string;
  maxLoad: string;
  rimRange: string;
  oeMarking: string;
  manufacturerProductNumber: string;
  discontinued: boolean;
  runFlat: boolean;
  hasRebate: boolean;
  rebates?: Array<{ code: string; description: string; url: string }>;
  serviceCategory: "passenger" | "truck";
  fitmentPosition: "front" | "rear" | "both";
  atdProductNumber: string;
  availability: { local: number; localPlus: number; nationwide: number };
  warehouseInventory?: Array<{ warehouse: string; quantity: number; name?: string; address?: string }>;
};
type FitmentOption = {
  trim: string;
  trimoption: string;
  vehicleid: string;
  staggeredfitment: string;
  position: Array<{
    front?: { trimspecs?: { Size?: string } };
    rear?: { trimspecs?: { Size?: string } };
    both?: { trimspecs?: { Size?: string } };
  }>;
};
type OrderFulfillment = {
  status?: string;
  quantity?: number;
  freight?: number;
  sourcedcname?: string;
  estimateddelivery?: string;
  shipmethod?: string;
};
type OrderLine = { fulfillments?: OrderFulfillment[] };
type OrderResult = {
  order?: {
    ordertotal?: number;
    thresholdmessage?: string;
    confirmationnumber?: string;
    orderlines?: OrderLine[];
  };
};
type WarehouseDetail = {
  name: string;
  address?: string;
  quantity: number;
  estimatedDelivery: string;
  shipMethod: string;
};

export default function TireShoppingBeta({
  internal = false,
}: {
  internal?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("2756518");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [snowOnly, setSnowOnly] = useState(false);
  const [sort, setSort] = useState(internal ? "margin" : "price");
  const [quantity, setQuantity] = useState(4);
  const [selected, setSelected] = useState<Product[]>([]);
  const [mode, setMode] = useState<"size" | "vehicle">(
    internal ? "size" : "vehicle",
  );
  const [vehicle, setVehicle] = useState({
    year: "",
    make: "",
    model: "",
    trim: "",
    trimoption: "",
    vehicleid: "",
  });
  const [years, setYears] = useState<string[]>([]),
    [makes, setMakes] = useState<string[]>([]),
    [models, setModels] = useState<string[]>([]),
    [trims, setTrims] = useState<string[]>([]),
    [fitmentOptions, setFitmentOptions] = useState<FitmentOption[]>([]);
  const [fitmentLoading, setFitmentLoading] = useState("");
  const [brand, setBrand] = useState("All"),
    [minPrice, setMinPrice] = useState(""),
    [maxPrice, setMaxPrice] = useState(""),
    [minWarranty, setMinWarranty] = useState("0"),
    [loadRange, setLoadRange] = useState("All"),
    [speedRating, setSpeedRating] = useState("All");
  const [runFlatOnly, setRunFlatOnly] = useState(false),
    [rebateOnly, setRebateOnly] = useState(false);
  const [orderProduct, setOrderProduct] = useState<Product | null>(null),
    [orderQuantity, setOrderQuantity] = useState(4),
    [orderPo, setOrderPo] = useState(""),
    [orderComment, setOrderComment] = useState("");
  const [orderPreview, setOrderPreview] = useState<OrderResult | null>(null),
    [orderBusy, setOrderBusy] = useState(false),
    [orderError, setOrderError] = useState(""),
    [orderConfirmation, setOrderConfirmation] = useState("");
  const [orderRequestId, setOrderRequestId] = useState("");
  const [orderChoosingSupplier, setOrderChoosingSupplier] = useState(false);
  const [imagePreview, setImagePreview] = useState<Product | null>(null);
  const [warehouseProductId, setWarehouseProductId] = useState("");
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [warehouseError, setWarehouseError] = useState("");
  const [warehouseDetails, setWarehouseDetails] = useState<WarehouseDetail[]>([]);
  useEffect(() => {
    if (!internal && !years.length) loadFitment("years");
  }, [internal]);
  useEffect(() => {
    if (!imagePreview) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [imagePreview]);

  async function atdApi(body: Record<string, unknown>) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (internal) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token)
        headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const response = await fetch("/api/atd", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, internal }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Supplier search failed");
    return payload;
  }
  async function loadFitment(
    action: string,
    selection: Record<string, string> = {},
  ) {
    setFitmentLoading(action);
    setError("");
    try {
      const payload = await atdApi({ action, selection });
      if (action === "years") setYears(payload.years || []);
      if (action === "makes") setMakes(payload.makes || []);
      if (action === "models") setModels(payload.models || []);
      if (action === "trims") setTrims(payload.trims || []);
      if (action === "options") setFitmentOptions(payload.trimoptions || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Supplier fitment failed");
    } finally {
      setFitmentLoading("");
    }
  }

  async function search() {
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const payload = await atdApi({ action: "size", query });
      setProducts(payload.products || []);
      setSelected([]);
    } catch (reason) {
      setProducts([]);
      setError(reason instanceof Error ? reason.message : "Supplier search failed");
    } finally {
      setLoading(false);
    }
  }
  async function searchVehicle() {
    const option = fitmentOptions.find(
      (item) => item.vehicleid === vehicle.vehicleid,
    );
    if (!option) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const payload = await atdApi({
        action: "fitment-products",
        vehicle: {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          trimoption: option.trimoption,
        },
      });
      setProducts(payload.products || []);
      setSelected([]);
      const position = option.position?.[0];
      setQuery(
        (
          position?.both?.trimspecs?.Size ||
          position?.front?.trimspecs?.Size ||
          ""
        ).replace(/[^0-9]/g, ""),
      );
    } catch (reason) {
      setProducts([]);
      setError(
        reason instanceof Error ? reason.message : "Supplier fitment search failed",
      );
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(products.map((item) => item.category).filter(Boolean)),
      ),
    ],
    [products],
  );
  const brands = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(products.map((item) => item.brand).filter(Boolean)),
      ).sort(),
    ],
    [products],
  );
  const loadRanges = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(products.map((item) => item.loadRange).filter(Boolean)),
      ).sort(),
    ],
    [products],
  );
  const speedRatings = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(
          products
            .map((item) => item.loadSpeed.split(/\s+/).pop() || "")
            .filter(Boolean),
        ),
      ).sort(),
    ],
    [products],
  );
  const results = useMemo(
    () =>
      products
        .filter(
          (tire) =>
            (category === "All" || tire.category === category) &&
            (!availableOnly ||
              tire.availability.local + tire.availability.localPlus > 0) &&
            (!snowOnly || tire.snowRated) &&
            (brand === "All" || tire.brand === brand) &&
            (!minPrice || tire.installedPrice >= Number(minPrice)) &&
            (!maxPrice || tire.installedPrice <= Number(maxPrice)) &&
            Number(
              (tire.warranty.match(/[\d,]+/)?.[0] || "0").replace(/,/g, ""),
            ) >= Number(minWarranty) &&
            (loadRange === "All" || tire.loadRange === loadRange) &&
            (speedRating === "All" ||
              tire.loadSpeed.split(/\s+/).pop() === speedRating) &&
            (!runFlatOnly || tire.runFlat) &&
            (!rebateOnly || tire.hasRebate),
        )
        .sort((a, b) => {
          if (sort === "availability")
            return (
              b.availability.local +
              b.availability.localPlus -
              (a.availability.local + a.availability.localPlus)
            );
          if (sort === "margin")
            return (
              b.installedPrice -
              (b.cost || 0) -
              (a.installedPrice - (a.cost || 0))
            );
          return a.installedPrice - b.installedPrice;
        }),
    [
      availableOnly,
      brand,
      category,
      loadRange,
      maxPrice,
      minPrice,
      minWarranty,
      products,
      rebateOnly,
      runFlatOnly,
      snowOnly,
      sort,
      speedRating,
    ],
  );

  function toggleSelected(tire: Product) {
    setSelected((items) => {
      if (items.some((item) => item.id === tire.id))
        return items.filter((item) => item.id !== tire.id);
      if (items.length >= 3) return items;
      return [...items, tire];
    });
  }

  function buildQuote() {
    if (!selected.length) return;
    sessionStorage.setItem(
      "bolt-tire-quote-selection",
      JSON.stringify({ tireSize: query, products: selected }),
    );
    router.push("/quotes/new?from=tire-shop");
  }
  function beginOrder(tire: Product) {
    setOrderProduct(tire);
    setOrderChoosingSupplier(false);
    setOrderQuantity(quantity);
    setOrderPo("");
    setOrderComment("");
    setOrderPreview(null);
    setOrderError("");
    setOrderConfirmation("");
    setOrderRequestId(crypto.randomUUID());
  }
  function chooseSupplier(tire: Product) {
    setOrderProduct(tire);
    setOrderChoosingSupplier(true);
    setOrderQuantity(quantity);
    setOrderPo("");
    setOrderComment("");
    setOrderPreview(null);
    setOrderError("");
    setOrderConfirmation("");
  }
  function supplierMatches(tire: Product) {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const identifiers = new Set([tire.manufacturerProductNumber, tire.atdProductNumber].map((value) => normalize(value || "")).filter(Boolean));
    return products.filter((candidate) => {
      const candidateIdentifiers = [candidate.manufacturerProductNumber, candidate.atdProductNumber].map((value) => normalize(value || "")).filter(Boolean);
      if (candidateIdentifiers.some((identifier) => identifiers.has(identifier))) return true;
      return normalize(candidate.brand) === normalize(tire.brand) && normalize(candidate.model) === normalize(tire.model) && normalize(candidate.size) === normalize(tire.size);
    });
  }
  function closeOrder() {
    if (orderBusy) return;
    setOrderProduct(null);
    setOrderPreview(null);
    setOrderError("");
    setOrderConfirmation("");
  }
  async function previewOrder() {
    if (!orderProduct) return;
    setOrderBusy(true);
    setOrderError("");
    setOrderPreview(null);
    try {
      const result = await atdApi({
        action: "preview-order",
        atdProductNumber: orderProduct.atdProductNumber,
        quantity: orderQuantity,
        customerPoNumber: orderPo,
        customerComment: orderComment,
      });
      setOrderPreview(result.preview || null);
    } catch (reason) {
      setOrderError(
        reason instanceof Error ? reason.message : "Supplier order preview failed",
      );
    } finally {
      setOrderBusy(false);
    }
  }
  async function toggleWarehouseDetails(tire: Product) {
    if (warehouseProductId === tire.id) {
      setWarehouseProductId("");
      return;
    }
    setWarehouseProductId(tire.id);
    setWarehouseLoading(true);
    setWarehouseError("");
    setWarehouseDetails([]);
    if (tire.supplier === "USAF") {
      setWarehouseDetails((tire.warehouseInventory || []).filter((item) => item.quantity > 0).map((item) => ({
        name: item.name || `U.S. AutoForce warehouse ${item.warehouse}`,
        address: item.address,
        quantity: item.quantity,
        estimatedDelivery: "",
        shipMethod: "U.S. AutoForce truck",
      })));
      setWarehouseLoading(false);
      return;
    }
    try {
      const result = await atdApi({
        action: "preview-order",
        atdProductNumber: tire.atdProductNumber,
        quantity,
      });
      const details: WarehouseDetail[] = (result.preview?.order?.orderlines || [])
        .flatMap((line: OrderLine) => line.fulfillments || [])
        .map((fulfillment: OrderFulfillment) => ({
          name: fulfillment.sourcedcname || "Nearby supplier warehouse",
          quantity: Number(fulfillment.quantity || 0),
          estimatedDelivery: fulfillment.estimateddelivery || "",
          shipMethod: fulfillment.shipmethod || "",
        }));
      setWarehouseDetails(details);
      if (!details.length) setWarehouseError("The supplier did not provide a warehouse breakdown for this tire.");
    } catch (reason) {
      setWarehouseError(reason instanceof Error ? reason.message : "Warehouse details could not be loaded.");
    } finally {
      setWarehouseLoading(false);
    }
  }
  async function placeOrder() {
    if (
      !orderProduct ||
      !orderPreview ||
      !orderRequestId ||
      !window.confirm(
        `Place this supplier order for ${orderQuantity} ${orderProduct.brand} ${orderProduct.model} tires now?`,
      )
    )
      return;
    setOrderBusy(true);
    setOrderError("");
    try {
      const result = await atdApi({
        action: "place-order",
        requestId: orderRequestId,
        atdProductNumber: orderProduct.atdProductNumber,
        quantity: orderQuantity,
        customerPoNumber: orderPo,
        customerComment: orderComment,
      });
      const confirmation = String(
        result.order?.order?.confirmationnumber ||
          result.order?.confirmationnumber ||
          "",
      );
      setOrderConfirmation(confirmation || "Order accepted by supplier");
      setOrderPreview(result.order || orderPreview);
      if (result.warning) setOrderError(result.warning);
    } catch (reason) {
      setOrderError(
        reason instanceof Error
          ? reason.message
          : "Supplier order could not be placed",
      );
    } finally {
      setOrderBusy(false);
    }
  }
  const staggered =
    results.some((item) => item.fitmentPosition === "front") &&
    results.some((item) => item.fitmentPosition === "rear");
  function openPurchaseBuilder(items: Product[]) {
    sessionStorage.setItem(
      "bolt-tire-purchase",
      JSON.stringify({
        query,
        products: items,
        quantity: items.length === 2 ? 4 : quantity,
      }),
    );
    router.push("/shop/configure");
  }

  return (
    <main className={`tire-beta-page ${internal ? "internal" : "public"}`}>
      <header className="tire-beta-hero">
        <div>
          <span className="tire-beta-kicker">
            {internal ? "Bolt Tire staff" : "Tires brought to you"}
          </span>
          <h1>
            {internal
              ? "Tire Search & Quoting"
              : "The right tires. Installed where you are."}
          </h1>
          <p>
            {internal
              ? "Live supplier products, pricing, images, and inventory."
              : "Shop by vehicle or tire size, compare transparent pricing, and request mobile installation from Bolt Tire."}
          </p>
          {!internal && (
            <div className="tire-beta-benefits">
              <span>✓ Mobile installation</span>
              <span>✓ Upfront estimates</span>
              <span>✓ Local availability</span>
            </div>
          )}
        </div>
        {internal ? (
          <span className="tire-beta-badge">Live inventory</span>
        ) : (
          <img
            className="tire-beta-hero-logo"
            src="/bolt-logo-white.png"
            alt="Bolt Tire"
          />
        )}
      </header>
      <section className="tire-beta-search-card">
        <div className="tire-beta-tabs">
          {!internal && (
            <button
              className={mode === "vehicle" ? "active" : ""}
              type="button"
              onClick={() => {
                setMode("vehicle");
                if (!years.length) loadFitment("years");
              }}
            >
              Shop by vehicle
            </button>
          )}
          <button
            className={mode === "size" ? "active" : ""}
            type="button"
            onClick={() => setMode("size")}
          >
            Shop by tire size
          </button>
          {internal && (
            <button
              className={mode === "vehicle" ? "active" : ""}
              type="button"
              onClick={() => {
                setMode("vehicle");
                if (!years.length) loadFitment("years");
              }}
            >
              Vehicle fitment
            </button>
          )}
          {internal && (
            <button type="button" disabled>
              VIN / plate · coming next
            </button>
          )}
        </div>
        {mode === "size" ? (
          <label className="tire-beta-search">
            <span>Enter tire size using digits only</span>
            <div>
              <input
                value={query}
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={(event) =>
                  setQuery(event.target.value.replace(/[^0-9]/g, ""))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") search();
                }}
                placeholder="2756518"
              />
              <button
                type="button"
                onClick={search}
                disabled={loading || !query.trim()}
              >
                {loading ? "Searching tires…" : "Search tires"}
              </button>
            </div>
            <small>Example: enter 2756518 for 275/65R18.</small>
          </label>
        ) : (
          <div className="tire-beta-fitment">
            <div className="tire-beta-fitment-grid">
              <label>
                <span>Year</span>
                <select
                  value={vehicle.year}
                  onChange={async (e) => {
                    const year = e.target.value;
                    setVehicle({
                      year,
                      make: "",
                      model: "",
                      trim: "",
                      trimoption: "",
                      vehicleid: "",
                    });
                    setMakes([]);
                    setModels([]);
                    setTrims([]);
                    setFitmentOptions([]);
                    if (year) await loadFitment("makes", { year });
                  }}
                >
                  <option value="">
                    {fitmentLoading === "years"
                      ? "Loading years…"
                      : "Select year"}
                  </option>
                  {years.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Make</span>
                <select
                  disabled={!vehicle.year}
                  value={vehicle.make}
                  onChange={async (e) => {
                    const make = e.target.value;
                    setVehicle((v) => ({
                      ...v,
                      make,
                      model: "",
                      trim: "",
                      trimoption: "",
                      vehicleid: "",
                    }));
                    setModels([]);
                    setTrims([]);
                    setFitmentOptions([]);
                    if (make)
                      await loadFitment("models", { year: vehicle.year, make });
                  }}
                >
                  <option value="">
                    {fitmentLoading === "makes"
                      ? "Loading makes…"
                      : "Select make"}
                  </option>
                  {makes.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Model</span>
                <select
                  disabled={!vehicle.make}
                  value={vehicle.model}
                  onChange={async (e) => {
                    const model = e.target.value;
                    setVehicle((v) => ({
                      ...v,
                      model,
                      trim: "",
                      trimoption: "",
                      vehicleid: "",
                    }));
                    setTrims([]);
                    setFitmentOptions([]);
                    if (model)
                      await loadFitment("trims", {
                        year: vehicle.year,
                        make: vehicle.make,
                        model,
                      });
                  }}
                >
                  <option value="">
                    {fitmentLoading === "models"
                      ? "Loading models…"
                      : "Select model"}
                  </option>
                  {models.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Trim</span>
                <select
                  disabled={!vehicle.model}
                  value={vehicle.trim}
                  onChange={async (e) => {
                    const trim = e.target.value;
                    setVehicle((v) => ({
                      ...v,
                      trim,
                      trimoption: "",
                      vehicleid: "",
                    }));
                    setFitmentOptions([]);
                    if (trim)
                      await loadFitment("options", {
                        year: vehicle.year,
                        make: vehicle.make,
                        model: vehicle.model,
                        trim,
                      });
                  }}
                >
                  <option value="">
                    {fitmentLoading === "trims"
                      ? "Loading trims…"
                      : "Select trim"}
                  </option>
                  {trims.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="tire-beta-fitment-option">
                <span>Factory tire option</span>
                <select
                  disabled={!vehicle.trim}
                  value={vehicle.vehicleid}
                  onChange={(e) => {
                    const option = fitmentOptions.find(
                      (item) => item.vehicleid === e.target.value,
                    );
                    setVehicle((v) => ({
                      ...v,
                      vehicleid: e.target.value,
                      trimoption: option?.trimoption || "",
                    }));
                  }}
                >
                  <option value="">
                    {fitmentLoading === "options"
                      ? "Loading tire options…"
                      : "Select tire option"}
                  </option>
                  {fitmentOptions.map((item) => (
                    <option value={item.vehicleid} key={item.vehicleid}>
                      {item.trimoption}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="tire-beta-fitment-search"
              disabled={!vehicle.vehicleid || loading}
              onClick={searchVehicle}
            >
              {loading ? "Searching tires…" : "Find tires for this vehicle"}
            </button>
          </div>
        )}
      </section>
      {error && (
        <div className="tire-beta-error">
          <strong>
            {internal
              ? "Supplier connection error"
              : "Tire search is temporarily unavailable"}
          </strong>
          <span>
            {internal
              ? error
              : "Please try again in a moment. If this continues, call or text Bolt Tire for help."}
          </span>
        </div>
      )}
      <div className="tire-beta-layout">
        <aside className="tire-beta-filters">
          <div className="tire-beta-filter-head">
            <strong>Filters</strong>
            <button
              type="button"
              onClick={() => {
                setCategory("All");
                setBrand("All");
                setMinPrice("");
                setMaxPrice("");
                setMinWarranty("0");
                setLoadRange("All");
                setSpeedRating("All");
                setAvailableOnly(true);
                setSnowOnly(false);
                setRunFlatOnly(false);
                setRebateOnly(false);
              }}
            >
              Reset
            </button>
          </div>
          <label>
            Brand
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              {brands.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className="tire-beta-price-range">
            <label>
              Min installed
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="$0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </label>
            <label>
              Max installed
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="Any"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </label>
          </div>
          <label>
            Minimum warranty
            <select
              value={minWarranty}
              onChange={(e) => setMinWarranty(e.target.value)}
            >
              <option value="0">Any warranty</option>
              <option value="40000">40,000+ miles</option>
              <option value="50000">50,000+ miles</option>
              <option value="60000">60,000+ miles</option>
              <option value="70000">70,000+ miles</option>
            </select>
          </label>
          <label>
            Load range
            <select
              value={loadRange}
              onChange={(e) => setLoadRange(e.target.value)}
            >
              {loadRanges.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Speed rating
            <select
              value={speedRating}
              onChange={(e) => setSpeedRating(e.target.value)}
            >
              {speedRatings.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="tire-beta-check">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
            />{" "}
            Available nearby
          </label>
          <label className="tire-beta-check">
            <input
              type="checkbox"
              checked={snowOnly}
              onChange={(event) => setSnowOnly(event.target.checked)}
            />{" "}
            Severe-snow rated
          </label>
          <label className="tire-beta-check">
            <input
              type="checkbox"
              checked={runFlatOnly}
              onChange={(e) => setRunFlatOnly(e.target.checked)}
            />{" "}
            Run-flat only
          </label>
          <label className="tire-beta-check">
            <input
              type="checkbox"
              checked={rebateOnly}
              onChange={(e) => setRebateOnly(e.target.checked)}
            />{" "}
            Rebate available
          </label>
        </aside>
        <section className="tire-beta-results">
          <div className="tire-beta-result-head">
            <div>
              <strong>{results.length} tires</strong>
              <span>
                {searched ? " from live inventory" : " — enter a size above"}
              </span>
            </div>
            <div className="tire-beta-result-controls">
              <label>
                Quantity{" "}
                <select
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <select
                aria-label="Sort tires"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="price">Lowest installed price</option>
                <option value="availability">Best availability</option>
                {internal && <option value="margin">Best gross profit</option>}
              </select>
            </div>
          </div>
          {internal && searched && (
            <div className="tire-beta-quote-tray">
              <div>
                <strong>{selected.length} of 3 selected</strong>
                <span>Choose up to three tires to compare on the quote.</span>
              </div>
              <button
                type="button"
                disabled={!selected.length}
                onClick={buildQuote}
              >
                Generate Quote
              </button>
            </div>
          )}
          {staggered && (
            <div className="tire-beta-staggered-note">
              <strong>Staggered fitment</strong>
              <span>
                Choose one front tire and one rear tire. Your quote will include
                two of each.
              </span>
            </div>
          )}
          {!searched || loading || results.length === 0 ? (
            <div className="tire-beta-empty">
              <strong>
                {loading
                  ? "Searching tires…"
                  : searched
                    ? "No available products matched."
                    : "Search live inventory by raw tire size."}
              </strong>
              <span>
                {searched && !loading
                  ? "Try turning off Available nearby or changing the size."
                  : "Live inventory results will appear here."}
              </span>
            </div>
          ) : (
            results.map((tire) => {
              const isSelected = selected.some((item) => item.id === tire.id);
              return (
                <article
                  className={`tire-beta-product ${isSelected ? "selected" : ""}`}
                  key={tire.id}
                >
                  {tire.imageUrl ? (
                    <button
                      type="button"
                      className="tire-beta-image tire-beta-image-button"
                      onClick={() => setImagePreview(tire)}
                      aria-label={`Enlarge ${tire.brand} ${tire.model} image`}
                    >
                      <img
                        src={tire.imageUrl}
                        alt={`${tire.brand} ${tire.model}`}
                      />
                      <small>Click to enlarge</small>
                    </button>
                  ) : (
                    <div className="tire-beta-image">
                      TIRE
                      <br />
                      <small>No image available</small>
                    </div>
                  )}
                  <div className="tire-beta-product-main">
                    <div className="tire-beta-brand-row">
                      <span className="tire-beta-brand">{tire.brand}</span>
                      {tire.fitmentPosition !== "both" && (
                        <span
                          className={`tire-beta-position ${tire.fitmentPosition}`}
                        >
                          {tire.fitmentPosition} fitment
                        </span>
                      )}
                    </div>
                    <h2>{tire.model}</h2>
                    <strong>
                      {tire.size || tire.description}
                      {tire.loadSpeed ? ` · ${tire.loadSpeed}` : ""}
                    </strong>
                    <div className="tire-beta-tags">
                      <span>{tire.category}</span>
                      {tire.warranty && <span>{tire.warranty} warranty</span>}
                      {tire.loadRange && <span>Load {tire.loadRange}</span>}
                      {tire.snowRated && <span>3PMSF</span>}
                      {tire.runFlat && <span>Run-flat</span>}
                      {tire.hasRebate && (
                        <span className="rebate-tag">Rebate available</span>
                      )}
                      {tire.discontinued && <span>Discontinued</span>}
                    </div>
                    {tire.rebates?.length ? (
                      <div className="tire-beta-rebates">
                        {tire.rebates.map((rebate, index) => (
                          <div key={`${rebate.code}-${index}`}>
                            <strong>{rebate.description}</strong>
                            {rebate.url ? (
                              <a
                                href={rebate.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View rebate details
                              </a>
                            ) : (
                              <small>Manufacturer terms apply</small>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <details className="tire-beta-details">
                      <summary>Tire details</summary>
                      <div>
                        {tire.manufacturerProductNumber && (
                          <span>
                            <small>Manufacturer part #</small>
                            <strong>{tire.manufacturerProductNumber}</strong>
                          </span>
                        )}
                        {tire.loadSpeed && (
                          <span>
                            <small>Load / speed</small>
                            <strong>{tire.loadSpeed}</strong>
                          </span>
                        )}
                        {tire.loadRange && (
                          <span>
                            <small>Load range</small>
                            <strong>{tire.loadRange}</strong>
                          </span>
                        )}
                        {tire.warranty && (
                          <span>
                            <small>Mileage warranty</small>
                            <strong>{tire.warranty}</strong>
                          </span>
                        )}
                        {tire.utqg && (
                          <span>
                            <small>UTQG</small>
                            <strong>{tire.utqg}</strong>
                          </span>
                        )}
                        {tire.treadDepth && (
                          <span>
                            <small>Tread depth</small>
                            <strong>{tire.treadDepth}</strong>
                          </span>
                        )}
                        {tire.sidewall && (
                          <span>
                            <small>Sidewall</small>
                            <strong>{tire.sidewall}</strong>
                          </span>
                        )}
                        {tire.maxLoad && (
                          <span>
                            <small>Maximum load</small>
                            <strong>{tire.maxLoad}</strong>
                          </span>
                        )}
                        {tire.rimRange && (
                          <span>
                            <small>Approved rim range</small>
                            <strong>{tire.rimRange}</strong>
                          </span>
                        )}
                        {tire.oeMarking && (
                          <span>
                            <small>OE marking</small>
                            <strong>{tire.oeMarking}</strong>
                          </span>
                        )}
                      </div>
                    </details>
                    <p>
                      {tire.availability.local
                        ? "Available locally"
                        : tire.availability.localPlus
                          ? internal
                            ? "Available from a nearby warehouse"
                            : "Available nearby — typically 1–2 days"
                          : internal
                            ? "Special order"
                            : "Available to order"}
                    </p>
                    {internal && (
                      <div className="tire-beta-stock">
                        <span>
                          Local <strong>{tire.availability.local}</strong>
                        </span>
                        <button
                          type="button"
                          className="tire-beta-warehouse-button"
                          aria-expanded={warehouseProductId === tire.id}
                          onClick={() => toggleWarehouseDetails(tire)}
                        >
                          {tire.supplier === "USAF" ? "Regional warehouses" : "Nearby warehouse"} <strong>{tire.availability.localPlus}</strong>
                          <b>{warehouseProductId === tire.id ? "▲" : "▼"}</b>
                        </button>
                        {tire.supplier !== "USAF" ? <span>
                          Nationwide{" "}
                          <strong>{tire.availability.nationwide}</strong>
                        </span> : null}
                      </div>
                    )}
                    {internal && warehouseProductId === tire.id && (
                      <div className="tire-beta-warehouse-details">
                        {warehouseLoading ? (
                          <span>Checking warehouse and delivery details…</span>
                        ) : warehouseError ? (
                          <span>{warehouseError}</span>
                        ) : (
                          warehouseDetails.map((detail, index) => (
                            <div key={`${detail.name}-${index}`}>
                              <strong>{detail.name}</strong>
                              {detail.address ? <span>{detail.address}</span> : null}
                              <span>
                                {detail.quantity || tire.availability.localPlus} tires
                                {detail.estimatedDelivery
                                  ? ` · Expected ${new Date(detail.estimatedDelivery).toLocaleDateString()}`
                                  : ""}
                                {detail.shipMethod ? ` · ${detail.shipMethod}` : ""}
                              </span>
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(detail.address || detail.name)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View distance and directions
                              </a>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="tire-beta-price">
                    {internal && (
                      <>
                        <span>
                          Supplier cost{" "}
                          <strong>${(tire.cost || 0).toFixed(2)}</strong>
                        </span>
                        <span>
                          Gross profit{" "}
                          <strong>
                            ${(tire.quotePrice - (tire.cost || 0)).toFixed(2)}
                          </strong>
                        </span>
                        <small>{tire.supplier || "ATD"} · {tire.atdProductNumber}</small>
                      </>
                    )}
                    <div className="tire-beta-customer-price">
                      <span>Tire price</span>
                      <strong>
                        ${tire.quotePrice.toFixed(2)} <small>each</small>
                      </strong>
                    </div>
                    {!staggered && (
                      <div className="tire-beta-total-price">
                        <span>Estimated total for {quantity}</span>
                        <strong>
                          $
                          {Number(
                            tire.estimatedTotals?.[String(quantity)] ??
                              tire.installedPrice * quantity,
                          ).toFixed(2)}
                        </strong>
                        <small>tires, installation & standard fees</small>
                      </div>
                    )}
                    <button
                      className={isSelected ? "selected" : ""}
                      type="button"
                      disabled={internal && !isSelected && selected.length >= 3}
                      onClick={() => {
                        if (internal) return toggleSelected(tire);
                        if (!staggered) return openPurchaseBuilder([tire]);
                        const next = isSelected
                          ? selected.filter(
                              (item) =>
                                item.id !== tire.id ||
                                item.fitmentPosition !== tire.fitmentPosition,
                            )
                          : [
                              ...selected.filter(
                                (item) =>
                                  item.fitmentPosition !== tire.fitmentPosition,
                              ),
                              tire,
                            ];
                        setSelected(next);
                        if (
                          next.some(
                            (item) => item.fitmentPosition === "front",
                          ) &&
                          next.some((item) => item.fitmentPosition === "rear")
                        )
                          openPurchaseBuilder(next);
                      }}
                    >
                      {internal
                        ? isSelected
                          ? "✓ Selected"
                          : selected.length >= 3
                            ? "3 selected"
                            : "Select for quote"
                        : staggered
                          ? `Choose ${tire.fitmentPosition}`
                          : "Customize & buy"}
                    </button>
                    {internal ? (
                      <button
                        className="tire-beta-direct-order"
                        type="button"
                        onClick={() => chooseSupplier(tire)}
                      >
                        Choose supplier
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
      {imagePreview?.imageUrl ? (
        <div
          className="tire-image-lightbox"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImagePreview(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${imagePreview.brand} ${imagePreview.model} enlarged image`}
          >
            <button
              type="button"
              className="tire-image-lightbox-close"
              onClick={() => setImagePreview(null)}
              aria-label="Close enlarged image"
            >
              ×
            </button>
            <img
              src={imagePreview.imageUrl}
              alt={`${imagePreview.brand} ${imagePreview.model}`}
            />
            <div>
              <strong>
                {imagePreview.brand} {imagePreview.model}
              </strong>
              <span>{imagePreview.size || imagePreview.description}</span>
            </div>
          </section>
        </div>
      ) : null}
      {internal && orderProduct ? (
        <div
          className="atd-order-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeOrder();
          }}
        >
          <section
            className="atd-order-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="atd-order-title"
          >
            <div className="atd-order-head">
              <div>
                <span>{orderChoosingSupplier ? "CHOOSE A SUPPLIER" : "DIRECT SUPPLIER ORDER"}</span>
                <h2 id="atd-order-title">
                  {orderProduct.brand} {orderProduct.model}
                </h2>
                <p>
                  {orderProduct.size || orderProduct.description} · Supplier #
                  {orderProduct.atdProductNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={closeOrder}
                aria-label="Close order dialog"
              >
                ×
              </button>
            </div>
            {orderChoosingSupplier ? (
              <div className="supplier-choice-list">
                <p>Select where you want to order this exact tire. Connected suppliers with a matching product are available below.</p>
                {(["ATD", "USAF", "K&M", "NTW"] as const).map((supplier) => {
                  const match = supplierMatches(orderProduct).find((item) => item.supplier === supplier);
                  const connected = supplier === "ATD" && Boolean(match);
                  return <button type="button" key={supplier} disabled={!connected} onClick={() => match && beginOrder(match)}>
                    <span><strong>{supplier === "USAF" ? "U.S. AutoForce" : supplier}</strong><small>{match ? `${match.atdProductNumber} · $${Number(match.cost || 0).toFixed(2)} each` : "No matching product in this search"}</small></span>
                    <b>{connected ? "Select" : match && supplier === "USAF" ? "Ordering connection next" : "Not connected"}</b>
                  </button>;
                })}
              </div>
            ) : orderConfirmation ? (
              <div className="atd-order-success">
                <strong>Supplier order placed</strong>
                <span>Confirmation: {orderConfirmation}</span>
                <button type="button" onClick={closeOrder}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="atd-order-fields">
                  <label>
                    Quantity
                    <select
                      value={orderQuantity}
                      onChange={(event) => {
                        setOrderQuantity(Number(event.target.value));
                        setOrderPreview(null);
                      }}
                    >
                      {Array.from({ length: 24 }, (_, index) => index + 1).map(
                        (item) => (
                          <option key={item}>{item}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Job / PO reference
                    <input
                      value={orderPo}
                      maxLength={50}
                      onChange={(event) => {
                        setOrderPo(event.target.value);
                        setOrderPreview(null);
                      }}
                      placeholder="Optional internal reference"
                    />
                  </label>
                  <label className="full">
                    Supplier comment
                    <input
                      value={orderComment}
                      maxLength={255}
                      onChange={(event) => {
                        setOrderComment(event.target.value);
                        setOrderPreview(null);
                      }}
                      placeholder="Optional delivery instructions"
                    />
                  </label>
                </div>
                <div className="atd-order-policy">
                  <strong>Ordering controls</strong>
                  <span>
                    Full quantity or cancel · Local and nearby inventory ·
                    Nationwide quick-ship disabled
                  </span>
                </div>
                {orderError ? (
                  <div className="atd-order-error">{orderError}</div>
                ) : null}
                {orderPreview?.order ? (
                  <div className="atd-order-preview">
                    <div>
                      <span>Supplier preview total</span>
                      <strong>
                        ${Number(orderPreview.order.ordertotal || 0).toFixed(2)}
                      </strong>
                    </div>
                    {orderPreview.order.thresholdmessage ? (
                      <p>{orderPreview.order.thresholdmessage}</p>
                    ) : null}
                    {(orderPreview.order.orderlines || [])
                      .flatMap((line) => line.fulfillments || [])
                      .map((fulfillment, index) => (
                        <div className="atd-order-fulfillment" key={index}>
                          <strong>
                            {fulfillment.status || "Pending"} ·{" "}
                            {fulfillment.quantity || 0} tires
                          </strong>
                          <span>
                            {[
                              fulfillment.sourcedcname,
                              fulfillment.shipmethod,
                              fulfillment.estimateddelivery
                                ? `Expected ${new Date(fulfillment.estimateddelivery).toLocaleDateString()}`
                                : "",
                              Number(fulfillment.freight || 0) > 0
                                ? `Freight $${Number(fulfillment.freight).toFixed(2)}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      ))}
                  </div>
                ) : null}
                <div className="atd-order-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={closeOrder}
                  >
                    Cancel
                  </button>
                  {orderPreview ? (
                    <button
                      type="button"
                      className="place"
                      disabled={orderBusy}
                      onClick={placeOrder}
                    >
                      {orderBusy ? "Placing order…" : "Place supplier order"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={previewOrder}
                    >
                      {orderBusy ? "Checking supplier…" : "Preview supplier order"}
                    </button>
                  )}
                </div>
                {orderPreview ? (
                  <small className="atd-order-warning">
                    “Place supplier order” immediately submits this purchase to the supplier.
                  </small>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
