alter table public.jobs
  add column if not exists ny_state_tire_fee numeric(12,2) not null default 0;

comment on column public.jobs.ny_state_tire_fee is
  'New York State waste tire management and recycling fee, currently $2.50 per applicable tire and not subject to sales tax.';
