alter table public.kingdom_facilities
  add column if not exists contact_name text,
  add column if not exists contact_number text;
