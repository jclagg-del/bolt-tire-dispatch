-- Server-only guard: claim before contacting Quo; never automatically retry an ambiguous result.
create table public.quote_text_deliveries (
  quote_id uuid primary key references public.quotes(id) on delete cascade,
  attempt_id uuid not null,
  status text not null check (status in ('pending', 'accepted', 'failed', 'unknown')),
  requested_at timestamptz not null default now(),
  requested_by uuid not null,
  recipient text not null,
  provider_message_id text,
  provider_status text
);
alter table public.quote_text_deliveries enable row level security;
revoke all on public.quote_text_deliveries from public, anon, authenticated, service_role;
grant select, insert, update on public.quote_text_deliveries to service_role;
