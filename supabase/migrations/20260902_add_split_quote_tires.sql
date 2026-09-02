alter table public.quotes
  add column if not exists rear_tire_size text,
  add column if not exists rear_quantity integer check (rear_quantity is null or rear_quantity > 0);

alter table public.quote_options
  add column if not exists rear_brand text,
  add column if not exists rear_model text,
  add column if not exists rear_image_url text,
  add column if not exists rear_price_per_tire numeric(10,2),
  add column if not exists rear_supplier text,
  add column if not exists rear_supplier_product_id text,
  add column if not exists rear_manufacturer_product_id text,
  add column if not exists rear_wholesale_cost numeric(10,2);
