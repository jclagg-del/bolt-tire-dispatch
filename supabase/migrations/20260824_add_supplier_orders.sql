create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  supplier text not null,
  atd_product_number text not null,
  quantity integer not null check (quantity > 0),
  customer_po_number text,
  customer_comment text,
  order_total numeric(12,2),
  confirmation_number text,
  status text not null default 'pending',
  response jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.supplier_orders enable row level security;

create index if not exists supplier_orders_created_at_idx
  on public.supplier_orders(created_at desc);
