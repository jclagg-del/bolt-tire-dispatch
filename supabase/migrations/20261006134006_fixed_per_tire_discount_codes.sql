begin;
set local lock_timeout = '5s';

-- Existing codes and quotes keep their original percentage behavior.
alter table public.discount_codes
  add column discount_type text not null default 'percent' check (discount_type in ('percent', 'fixed')),
  add column fixed_amount numeric(8,2) not null default 0 check (fixed_amount >= 0 and fixed_amount <= 999999.99),
  add constraint discount_code_value_matches_type check (
    (discount_type = 'percent' and fixed_amount = 0) or (discount_type = 'fixed' and percent = 0)
  );

-- Snapshot the approved benefit; net prices and actual savings already live
-- on quote_options and quotes.discount_amount respectively.
alter table public.quotes
  add column discount_type text not null default 'percent' check (discount_type in ('percent', 'fixed')),
  add column discount_fixed_amount numeric(8,2) not null default 0 check (discount_fixed_amount >= 0 and discount_fixed_amount <= 999999.99);

-- A mixed-size set is stored on a job at its average unit price. Preserve
-- half-cents here (e.g. 2 x $79.99 and 2 x $0 = 4 x $39.995), so later job
-- saves and invoices still match the actual cent-rounded purchase total.
alter table public.jobs alter column price_tires type numeric(12,4);

create function public.protect_quote_discount_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.payment_status in ('pending', 'paid') or old.converted_job_id is not null)
    and (new.discount_type, new.discount_fixed_amount, new.discount_percent, new.discount_amount, new.discount_code_id)
      is distinct from (old.discount_type, old.discount_fixed_amount, old.discount_percent, old.discount_amount, old.discount_code_id) then
    raise exception 'Discount cannot change after checkout begins or a quote is converted.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_quote_discount_snapshot() from public, anon, authenticated;
create trigger protect_quote_discount_snapshot before update on public.quotes
for each row execute function public.protect_quote_discount_snapshot();

commit;
