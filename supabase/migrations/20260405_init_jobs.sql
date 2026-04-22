create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null,
  tire text,
  tire_size text,
  quantity integer,
  ordered boolean not null default false,
  vehicle text,
  position text,
  scheduled boolean not null default false,
  scheduled_at timestamptz,
  contact_name text,
  phone text,
  address text,
  email text,
  total numeric(10,2),
  billed boolean not null default false,
  bill_date date,
  paid boolean not null default false,
  complete boolean not null default false,
  notes text
);

create index if not exists jobs_scheduled_at_idx on public.jobs (scheduled_at);
create index if not exists jobs_customer_name_idx on public.jobs (customer_name);
create index if not exists jobs_complete_idx on public.jobs (complete);
create index if not exists jobs_paid_idx on public.jobs (paid);

alter table public.jobs enable row level security;

create policy "Allow authenticated read jobs"
on public.jobs
for select
using (auth.role() = 'authenticated');

create policy "Allow authenticated insert jobs"
on public.jobs
for insert
with check (auth.role() = 'authenticated');

create policy "Allow authenticated update jobs"
on public.jobs
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
