create table if not exists public.quickbooks_connections (
  id boolean primary key default true check (id),
  realm_id text not null,
  environment text not null default 'sandbox',
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.quickbooks_connections enable row level security;

alter table public.jobs
  add column if not exists quickbooks_invoice_id text,
  add column if not exists quickbooks_customer_id text,
  add column if not exists quickbooks_balance numeric(12,2),
  add column if not exists quickbooks_synced_at timestamptz;

comment on table public.quickbooks_connections is
  'Server-only QuickBooks OAuth tokens. Access only with the Supabase service role.';
