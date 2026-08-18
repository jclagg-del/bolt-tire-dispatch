export type BusinessSettings = {
  id: boolean;
  passenger_two_install: number;
  passenger_four_install: number;
  truck_two_install: number;
  truck_four_install: number;
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
  passenger_two_install: 175,
  passenger_four_install: 275,
  truck_two_install: 195,
  truck_four_install: 325,
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
  category: "passenger" | "truck" = "passenger"
) {
  if (category === "truck") {
    if (quantity >= 4) return settings.truck_four_install;
    if (quantity >= 2) return settings.truck_two_install;
    return settings.truck_two_install / 2;
  }

  if (quantity >= 4) return settings.passenger_four_install;
  if (quantity >= 2) return settings.passenger_two_install;
  return settings.passenger_two_install / 2;
}
