-- Optional per-choice size. Existing quotes fall back to quotes.tire_size;
-- no historical quote, payment, price, policy, or grant is changed.
alter table public.quote_options add column if not exists tire_size text;
comment on column public.quote_options.tire_size is
  'Tire size for this comparison choice; NULL uses the legacy quote-level size.';
