alter table public.business_settings
  add column if not exists tire_shop_passenger_markup_percent numeric not null default 25,
  add column if not exists tire_shop_passenger_min_profit numeric not null default 50,
  add column if not exists tire_shop_truck_markup_percent numeric not null default 25,
  add column if not exists tire_shop_truck_min_profit numeric not null default 60;

