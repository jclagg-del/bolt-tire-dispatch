export type BusinessSettings = {
  id: boolean;
  passenger_two_install: number;
  passenger_four_install: number;
  truck_two_install: number;
  truck_four_install: number;
  truck_six_install: number;
  heavy_truck_two_install: number;
  heavy_truck_four_install: number;
  medium_dismount_two_install: number;
  medium_dismount_four_install: number;
  trailer_atv_install_discount: number;
  minimum_site_price: number;
  commercial_service_call: number;
  commercial_17_install: number;
  commercial_19_install: number;
  commercial_22_install: number;
  commercial_super_single_install: number;
  inside_dual_surcharge: number;
  passenger_disposal_fee: number;
  truck_disposal_fee: number;
  commercial_disposal_fee: number;
  ny_state_tire_fee: number;
  default_sales_tax_rate: number;
  base_address: string | null;
  included_radius_miles: number;
  extra_mileage_rate: number;
  tire_shop_passenger_markup_percent: number;
  tire_shop_passenger_min_profit: number;
  tire_shop_truck_markup_percent: number;
  tire_shop_truck_min_profit: number;
};

export const fallbackBusinessSettings: BusinessSettings = {
  id: true,
  passenger_two_install: 189,
  passenger_four_install: 299,
  truck_two_install: 229,
  truck_four_install: 329,
  truck_six_install: 425,
  heavy_truck_two_install: 249,
  heavy_truck_four_install: 375,
  medium_dismount_two_install: 229,
  medium_dismount_four_install: 329,
  trailer_atv_install_discount: 50,
  minimum_site_price: 189,
  commercial_service_call: 95,
  commercial_17_install: 45,
  commercial_19_install: 55,
  commercial_22_install: 65,
  commercial_super_single_install: 90,
  inside_dual_surcharge: 12.5,
  passenger_disposal_fee: 7,
  truck_disposal_fee: 12,
  commercial_disposal_fee: 20,
  ny_state_tire_fee: 2.5,
  default_sales_tax_rate: 0,
  base_address: null,
  included_radius_miles: 20,
  extra_mileage_rate: 0,
  tire_shop_passenger_markup_percent: 25,
  tire_shop_passenger_min_profit: 50,
  tire_shop_truck_markup_percent: 25,
  tire_shop_truck_min_profit: 60,
};

export function installationDefault(
  settings: BusinessSettings,
  quantity: number,
  category: "passenger" | "truck" | "commercial" | "medium_dismount" | "trailer_atv" | "tires_only" = "passenger"
) {
  if (category === "tires_only") return 0;
  if (category === "trailer_atv") {
    if (quantity < 3) return Math.max(settings.minimum_site_price, settings.passenger_two_install);
    return Math.max(settings.minimum_site_price, settings.passenger_four_install - settings.trailer_atv_install_discount);
  }
  if (category === "commercial") {
    if (quantity >= 3) return Math.max(settings.minimum_site_price, settings.heavy_truck_four_install);
    return Math.max(settings.minimum_site_price, settings.heavy_truck_two_install);
  }
  if (category === "medium_dismount") {
    if (quantity >= 3) return Math.max(settings.minimum_site_price, settings.medium_dismount_four_install);
    return Math.max(settings.minimum_site_price, settings.medium_dismount_two_install);
  }
  if (category === "truck") {
    if (quantity >= 5) return Math.max(settings.minimum_site_price, settings.truck_six_install);
    if (quantity >= 3) return Math.max(settings.minimum_site_price, settings.truck_four_install);
    return Math.max(settings.minimum_site_price, settings.truck_two_install);
  }

  if (quantity >= 3) return Math.max(settings.minimum_site_price, settings.passenger_four_install);
  return Math.max(settings.minimum_site_price, settings.passenger_two_install);
}
