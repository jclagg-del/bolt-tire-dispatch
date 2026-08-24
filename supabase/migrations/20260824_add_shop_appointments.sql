alter table public.quotes
  add column if not exists purchase_source text,
  add column if not exists requested_date date,
  add column if not exists requested_time time,
  add column if not exists appointment_hold_expires_at timestamptz;

alter table public.jobs
  add column if not exists source_quote_id uuid references public.quotes(id);

create unique index if not exists jobs_source_quote_unique
  on public.jobs(source_quote_id)
  where source_quote_id is not null;

create index if not exists quotes_appointment_hold_idx
  on public.quotes(requested_date, requested_time, appointment_hold_expires_at)
  where purchase_source = 'website';
