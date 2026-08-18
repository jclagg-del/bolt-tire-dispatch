alter table public.business_settings
  add column if not exists truck_six_install numeric(10,2) not null default 425,
  add column if not exists heavy_truck_two_install numeric(10,2) not null default 249,
  add column if not exists heavy_truck_four_install numeric(10,2) not null default 375,
  add column if not exists medium_dismount_two_install numeric(10,2) not null default 229,
  add column if not exists medium_dismount_four_install numeric(10,2) not null default 329,
  add column if not exists trailer_atv_install_discount numeric(10,2) not null default 50,
  add column if not exists minimum_site_price numeric(10,2) not null default 189;

update public.business_settings
set passenger_two_install = 189,
    passenger_four_install = 299,
    truck_two_install = 229,
    truck_four_install = 329,
    truck_six_install = 425,
    heavy_truck_two_install = 249,
    heavy_truck_four_install = 375,
    medium_dismount_two_install = 229,
    medium_dismount_four_install = 329,
    trailer_atv_install_discount = 50,
    minimum_site_price = 189,
    updated_at = now()
where id = true;

alter table public.quotes drop constraint if exists quotes_service_category_check;
alter table public.quotes add constraint quotes_service_category_check
  check (service_category in ('passenger','trailer_atv','truck','commercial'));
