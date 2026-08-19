alter table public.business_settings
  add column if not exists trailer_atv_install_price numeric(10,2) not null default 249,
  add column if not exists skid_steer_install_price numeric(10,2) not null default 329;

update public.business_settings
set trailer_atv_install_price = 249,
    skid_steer_install_price = 329,
    updated_at = now()
where id = true;

alter table public.quotes drop constraint if exists quotes_service_category_check;
alter table public.quotes add constraint quotes_service_category_check
  check (service_category in ('passenger','tires_only','trailer_atv','off_road','skid_steer','truck','commercial','medium_dismount'));

