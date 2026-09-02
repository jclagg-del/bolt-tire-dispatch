alter table public.business_settings
  add column if not exists commercial_per_tire numeric(10,2) not null default 55;

update public.business_settings
set commercial_service_call = 125,
    commercial_per_tire = 55
where id = true;
