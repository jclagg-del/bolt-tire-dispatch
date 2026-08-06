create table if not exists public.business_settings (
  id boolean primary key default true check (id),
  passenger_two_install numeric(10,2) not null default 175,
  passenger_four_install numeric(10,2) not null default 275,
  truck_two_install numeric(10,2) not null default 195,
  truck_four_install numeric(10,2) not null default 325,
  commercial_service_call numeric(10,2) not null default 95,
  commercial_17_install numeric(10,2) not null default 45,
  commercial_19_install numeric(10,2) not null default 55,
  commercial_22_install numeric(10,2) not null default 65,
  commercial_super_single_install numeric(10,2) not null default 90,
  inside_dual_surcharge numeric(10,2) not null default 12.50,
  passenger_disposal_fee numeric(10,2) not null default 7,
  truck_disposal_fee numeric(10,2) not null default 12,
  commercial_disposal_fee numeric(10,2) not null default 20,
  ny_state_tire_fee numeric(10,2) not null default 2.50,
  default_sales_tax_rate numeric(8,4) not null default 0,
  base_address text,
  included_radius_miles numeric(8,2) not null default 20,
  extra_mileage_rate numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.business_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.business_settings enable row level security;

create policy "Allow authenticated read business settings"
on public.business_settings for select
using (auth.role() = 'authenticated');

create policy "Allow authenticated update business settings"
on public.business_settings for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quo_phone_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.technicians enable row level security;

create policy "Allow authenticated read technicians"
on public.technicians for select
using (auth.role() = 'authenticated');

create policy "Allow authenticated insert technicians"
on public.technicians for insert
with check (auth.role() = 'authenticated');

create policy "Allow authenticated update technicians"
on public.technicians for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Allow authenticated delete technicians"
on public.technicians for delete
using (auth.role() = 'authenticated');

create index if not exists technicians_active_name_idx
on public.technicians (active, name);
