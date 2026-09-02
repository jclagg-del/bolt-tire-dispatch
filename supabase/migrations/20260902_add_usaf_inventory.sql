create table if not exists public.usaf_inventory (
  part_number text primary key,
  brand_code text,
  brand text not null,
  model text not null,
  sales_class text,
  tire_type text,
  tire_size text not null,
  tire_size_key text not null,
  width text,
  aspect_ratio text,
  rim text,
  ply_rating text,
  utqg text,
  sidewall text,
  load_range text,
  tread_depth text,
  warranty text,
  upc text,
  discontinued boolean not null default false,
  ev_compatible boolean not null default false,
  run_flat boolean not null default false,
  snowflake boolean not null default false,
  noise_canceling boolean not null default false,
  fet numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  wholesale_cost numeric(12,2) not null default 0,
  retail_price numeric(12,2) not null default 0,
  map_price numeric(12,2) not null default 0,
  total_quantity numeric(12,2) not null default 0,
  warehouse_inventory jsonb not null default '[]'::jsonb,
  source_modified_at timestamptz,
  imported_at timestamptz not null default now(),
  import_batch uuid not null
);

create index if not exists usaf_inventory_size_key_idx on public.usaf_inventory (tire_size_key);
create index if not exists usaf_inventory_brand_idx on public.usaf_inventory (brand);
create index if not exists usaf_inventory_quantity_idx on public.usaf_inventory (total_quantity);

alter table public.usaf_inventory enable row level security;

create table if not exists public.usaf_import_runs (
  id uuid primary key,
  source_file text not null,
  source_modified_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  row_count integer not null default 0,
  product_count integer not null default 0,
  status text not null check (status in ('running', 'completed', 'failed')),
  error text
);

alter table public.usaf_import_runs enable row level security;
