alter table public.customer_orders
  add column if not exists service_method text,
  add column if not exists goodyear_order boolean not null default false;

update public.customer_orders
set service_method = 'installed'
where service_method is null;

alter table public.customer_orders
  alter column service_method set default 'installed';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_orders_service_method_check'
  ) then
    alter table public.customer_orders
      add constraint customer_orders_service_method_check
      check (service_method in ('installed', 'delivery_pickup'));
  end if;
end $$;
