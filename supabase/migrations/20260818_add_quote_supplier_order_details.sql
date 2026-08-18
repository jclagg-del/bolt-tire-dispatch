alter table public.quote_options
  add column if not exists supplier text,
  add column if not exists supplier_product_id text,
  add column if not exists manufacturer_product_id text,
  add column if not exists wholesale_cost numeric(12,2),
  add column if not exists supplier_availability jsonb;

