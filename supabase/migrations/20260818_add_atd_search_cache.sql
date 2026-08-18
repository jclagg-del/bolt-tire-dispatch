create table if not exists public.atd_search_cache (
  cache_key text primary key,
  products jsonb not null default '[]'::jsonb,
  cached_at timestamptz not null default now()
);

alter table public.atd_search_cache enable row level security;
revoke all on public.atd_search_cache from anon, authenticated;
