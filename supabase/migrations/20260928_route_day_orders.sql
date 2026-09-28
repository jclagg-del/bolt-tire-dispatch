-- Stop order is independent of appointment times and vehicle assignments.
create table if not exists public.route_day_orders (
  route_date date not null,
  vehicle_id text not null,
  job_ids jsonb not null check (jsonb_typeof(job_ids) = 'array'),
  revision integer not null default 1 check (revision > 0),
  primary key (route_date, vehicle_id)
);
alter table public.route_day_orders enable row level security;
-- Access only through the staff-authorized route API, never from public clients.
revoke all on public.route_day_orders from anon, authenticated;
grant select, insert, update on public.route_day_orders to service_role;
