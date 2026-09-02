import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fallbackBusinessSettings, installationDefault, type BusinessSettings } from "@/lib/business-settings";
import { regionalUsafWarehouse } from "@/lib/usaf-warehouses";

type UsaForceRow = {
  part_number: string;
  brand: string;
  model: string;
  sales_class: string | null;
  tire_type: string | null;
  tire_size: string;
  ply_rating: string | null;
  utqg: string | null;
  sidewall: string | null;
  load_range: string | null;
  tread_depth: string | null;
  warranty: string | null;
  upc: string | null;
  discontinued: boolean;
  run_flat: boolean;
  snowflake: boolean;
  cost: number;
  map_price: number;
  retail_price: number;
  total_quantity: number;
  warehouse_inventory: Array<{ warehouse: string; quantity: number }>;
};

async function pricingSettings() {
  const { data } = await createAdminClient().from("business_settings").select("*").eq("id", true).maybeSingle();
  return { ...fallbackBusinessSettings, ...(data || {}) } as BusinessSettings;
}

export async function searchUsafBySize(query: string, includeCost: boolean) {
  const sizeKey = query.replace(/\D/g, "");
  if (sizeKey.length < 5) return [];
  const admin = createAdminClient();
  const [{ data, error }, settings] = await Promise.all([
    admin.from("usaf_inventory").select("part_number,brand,model,sales_class,tire_type,tire_size,ply_rating,utqg,sidewall,load_range,tread_depth,warranty,upc,discontinued,run_flat,snowflake,cost,map_price,retail_price,total_quantity,warehouse_inventory").eq("tire_size_key", sizeKey).eq("discontinued", false).gt("total_quantity", 0).order("cost").limit(60),
    pricingSettings(),
  ]);
  if (error) {
    if (error.code === "42P01") return [];
    throw new Error(error.message);
  }
  return ((data || []) as UsaForceRow[]).map((row) => {
    const truck = /truck|commercial|medium/i.test(`${row.tire_type || ""} ${row.sales_class || ""}`);
    const markup = truck ? settings.tire_shop_truck_markup_percent : settings.tire_shop_passenger_markup_percent;
    const minimumProfit = truck ? settings.tire_shop_truck_min_profit : settings.tire_shop_passenger_min_profit;
    const cost = Number(row.cost || 0);
    const quotePrice = Math.max(Number(row.map_price || 0), Math.ceil(cost + Math.max(cost * markup / 100, minimumProfit)));
    const disposal = truck ? settings.truck_disposal_fee : settings.passenger_disposal_fee;
    const estimatedTotals = Object.fromEntries([1, 2, 3, 4, 5, 6].map((quantity) => [quantity, quotePrice * quantity + installationDefault(settings, quantity, truck ? "truck" : "passenger") + disposal * quantity + settings.ny_state_tire_fee * quantity]));
    const warehouses = (Array.isArray(row.warehouse_inventory) ? row.warehouse_inventory : [])
      .filter((warehouse) => warehouse.quantity > 0 && regionalUsafWarehouse(warehouse.warehouse))
      .map((warehouse) => ({ ...warehouse, ...regionalUsafWarehouse(warehouse.warehouse)! }));
    const regionalQuantity = warehouses.reduce((sum, warehouse) => sum + Number(warehouse.quantity || 0), 0);
    if (!regionalQuantity) return null;
    return {
      id: `USAF-${row.part_number}`,
      supplier: "USAF",
      atdProductNumber: row.part_number,
      manufacturerProductNumber: row.upc || row.part_number,
      brand: row.brand,
      model: row.model,
      description: row.sales_class || row.model,
      size: row.tire_size,
      category: row.tire_type || "Tire",
      serviceCategory: truck ? "truck" : "passenger",
      fitmentPosition: "both",
      loadSpeed: [row.load_range && `Load ${row.load_range}`, row.ply_rating && `${row.ply_rating} ply`].filter(Boolean).join(" · "),
      warranty: row.warranty || "",
      snowRated: row.snowflake,
      loadRange: row.load_range || "",
      treadDepth: row.tread_depth || "",
      utqg: row.utqg || "",
      sidewall: row.sidewall || "",
      maxLoad: "",
      rimRange: "",
      oeMarking: "",
      imageUrl: null,
      discontinued: row.discontinued,
      runFlat: row.run_flat,
      hasRebate: false,
      rebates: [],
      quotePrice,
      installedPrice: estimatedTotals[1],
      estimatedTotals,
      ...(includeCost ? { cost, map: Number(row.map_price || 0), msrp: Number(row.retail_price || 0) } : {}),
      availability: { local: 0, localPlus: regionalQuantity, nationwide: regionalQuantity },
      warehouseInventory: warehouses,
    };
  }).filter((product): product is NonNullable<typeof product> => product !== null);
}
