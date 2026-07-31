alter table public.jobs
  add column if not exists estimated_delivery_date date,
  add column if not exists tires_received boolean not null default false;

comment on column public.jobs.estimated_delivery_date is
  'Estimated date the ordered tires will arrive.';

comment on column public.jobs.tires_received is
  'True when all tires required for the job have been received.';
