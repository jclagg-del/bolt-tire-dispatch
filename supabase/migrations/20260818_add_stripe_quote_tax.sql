alter table public.quotes
  add column if not exists stripe_sales_tax_amount numeric(12,2);

comment on column public.quotes.stripe_sales_tax_amount is
  'Exact sales tax collected by Stripe Checkout automatic tax.';
