alter table public.customer_orders
  drop constraint if exists customer_orders_service_method_check;

alter table public.customer_orders
  add constraint customer_orders_service_method_check
  check (service_method in ('installed', 'delivery', 'pickup', 'delivery_pickup'));
