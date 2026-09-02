create table if not exists public.inventory_match_audits (
  canonical_key text primary key,
  tire_size text not null,
  brand text not null,
  model text not null,
  status text not null check (status in ('matched', 'review')),
  confidence integer not null check (confidence between 0 and 100),
  reason text not null,
  supplier_offers jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists inventory_match_audits_status_idx on public.inventory_match_audits(status, last_seen_at desc);
alter table public.inventory_match_audits enable row level security;
