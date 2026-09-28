begin;

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  description text not null default '',
  percent numeric(6,3) not null check (percent >= 0 and percent <= 100),
  organization text,
  tax_exempt boolean not null default false,
  exemption_reference text,
  active boolean not null default false,
  expires_on date,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not tax_exempt or (length(trim(organization)) > 0 and length(trim(exemption_reference)) > 0 and organization is not null and exemption_reference is not null))
);
alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from anon, authenticated;
grant all on public.discount_codes to service_role;

-- Code administration relies on staff roles; self-service profile updates must
-- not allow a user to promote their own role.
revoke update on public.staff_security from authenticated;
grant update (password_change_required, password_changed_at, updated_at) on public.staff_security to authenticated;

alter table public.quotes
  add column discount_code_id uuid references public.discount_codes(id),
  add column discount_code_label text,
  add column discount_percent numeric(6,3) not null default 0,
  add column discount_amount numeric(12,2) not null default 0,
  add column discount_organization text,
  add column checkout_service text;
alter table public.quote_options
  add column original_price_per_tire numeric(12,2),
  add column original_rear_price_per_tire numeric(12,2);

alter table public.customer_orders
  add column source_quote_id uuid references public.quotes(id),
  add column payment_status text not null default 'unpaid',
  add column amount_paid numeric(12,2),
  add column paid_at timestamptz,
  add column tax_exempt boolean not null default false,
  add column discount_code_label text,
  add column discount_amount numeric(12,2) not null default 0,
  add column tire_items jsonb,
  add column payment_notification_sent_at timestamptz,
  alter column requested_date drop not null,
  alter column requested_time drop not null;
create unique index customer_orders_source_quote_unique on public.customer_orders(source_quote_id) where source_quote_id is not null;
-- Anonymous fleet submission must not fabricate a paid/exempt checkout record.
alter policy "Kingdom orders can be submitted" on public.customer_orders
  with check (source_quote_id is null and payment_status = 'unpaid' and amount_paid is null
    and paid_at is null and not tax_exempt and discount_code_label is null and discount_amount = 0);
alter policy "Authenticated users can delete customer orders" on public.customer_orders
  using (payment_status <> 'paid');
-- Ordinary fleet requests still require a date/time. Paid tires-only orders may
-- wait in Orders until staff arrange delivery or pickup.
alter table public.customer_orders add constraint customer_order_appointment_required
  check (source_quote_id is not null or (requested_date is not null and requested_time is not null)) not valid;

commit;
