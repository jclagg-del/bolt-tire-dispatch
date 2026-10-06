-- Quote-wide charges are snapshotted onto the job, preserving invoice mappings.
alter table public.quotes add column if not exists additional_items jsonb not null default '[]'::jsonb;
alter table public.jobs add column if not exists additional_items jsonb not null default '[]'::jsonb;

create or replace function public.valid_additional_items(items jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; field text; qty numeric; price numeric;
begin
  if items is null or jsonb_typeof(items) <> 'array' then return false; end if;
  if jsonb_array_length(items) > 50 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'description') is distinct from 'string'
      or length(btrim(item->>'description')) = 0 or length(item->>'description') > 500
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or jsonb_typeof(item->'unit_price') is distinct from 'number'
      or jsonb_typeof(item->'taxable') is distinct from 'boolean' then return false; end if;
    qty := (item->>'quantity')::numeric; price := (item->>'unit_price')::numeric;
    if qty <= 0 or qty > 10000 or price < 0 or price > 1000000 or round(price,2) <> price then return false; end if;
    foreach field in array array['quickbooks_item_id','quickbooks_item_name','quickbooks_company_id'] loop
      if item ? field and (jsonb_typeof(item->field) <> 'string' or length(item->>field) > 500) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
revoke all on function public.valid_additional_items(jsonb) from public, anon;
grant execute on function public.valid_additional_items(jsonb) to authenticated, service_role;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='quotes_additional_items_valid' and conrelid='public.quotes'::regclass) then
    alter table public.quotes add constraint quotes_additional_items_valid check(public.valid_additional_items(additional_items));
  end if;
  if not exists(select 1 from pg_constraint where conname='jobs_additional_items_valid' and conrelid='public.jobs'::regclass) then
    alter table public.jobs add constraint jobs_additional_items_valid check(public.valid_additional_items(additional_items));
  end if;
end $$;

-- An already-open payment session must not charge one set of extras while a
-- later job/invoice receives another. Old quotes have an empty list by default.
create or replace function public.protect_quote_additional_items()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.additional_items is distinct from new.additional_items
    and (old.payment_status in ('pending','paid') or old.converted_job_id is not null) then
    raise exception 'Additional items cannot change while payment is pending, after payment, or after conversion.';
  end if;
  return new;
end $$;
revoke all on function public.protect_quote_additional_items() from public, anon, authenticated;
drop trigger if exists protect_quote_additional_items on public.quotes;
create trigger protect_quote_additional_items before update on public.quotes
for each row execute function public.protect_quote_additional_items();
