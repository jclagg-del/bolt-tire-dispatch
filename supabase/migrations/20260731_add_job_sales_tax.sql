alter table public.jobs
  add column if not exists subtotal numeric(12,2),
  add column if not exists sales_tax_rate numeric(7,4) not null default 0,
  add column if not exists sales_tax_amount numeric(12,2) not null default 0,
  add column if not exists tax_exempt boolean not null default false;

comment on column public.jobs.sales_tax_rate is
  'Sales tax percentage applicable at the service address, for example 8.125.';

comment on column public.jobs.tax_exempt is
  'True when the client is exempt from sales tax for this job.';
