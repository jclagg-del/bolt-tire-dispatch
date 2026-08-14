alter table public.quotes add column if not exists public_token uuid not null default gen_random_uuid();
alter table public.quotes add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded'));
alter table public.quotes add column if not exists stripe_checkout_session_id text;
alter table public.quotes add column if not exists stripe_payment_intent_id text;
alter table public.quotes add column if not exists paid_at timestamptz;
alter table public.quotes add column if not exists amount_paid numeric(12,2);
create unique index if not exists quotes_public_token_idx on public.quotes(public_token);
create unique index if not exists quotes_stripe_session_idx on public.quotes(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
