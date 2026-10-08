-- New checkout is feature-gated. Existing quotes retain their original pricing.
alter table public.quotes add column if not exists payment_pricing_version integer;
alter table public.quotes add column if not exists payment_pricing_snapshot jsonb;
alter table public.quotes add column if not exists payment_funding text;

create table public.quote_payment_attempts (
  id uuid primary key,
  quote_id uuid not null references public.quotes(id),
  option_id uuid not null references public.quote_options(id),
  confirmation_token text not null unique,
  state text not null default 'review' check (state in ('review','submitting','requires_action','requires_confirmation','processing','succeeded','failed','canceled','expired')),
  funding text not null check (funding in ('credit','debit','prepaid','us_bank_account')),
  payment_method_type text not null check (payment_method_type in ('card','us_bank_account')),
  stripe_payment_method_id text,
  stripe_payment_intent_id text unique,
  snapshot jsonb not null,
  tax_calculation_id text,
  amount_cents integer not null check (amount_cents between 50 and 99999999),
  tax_cents integer not null check (tax_cents >= 0 and tax_cents < amount_cents),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index quote_payment_one_active on public.quote_payment_attempts(quote_id)
  where state not in ('failed','canceled','expired');
create index quote_payment_option on public.quote_payment_attempts(option_id);
alter table public.quote_payment_attempts enable row level security;
revoke all on public.quote_payment_attempts from public, anon, authenticated;
grant select, insert, update on public.quote_payment_attempts to service_role;

-- Acquire a short database lock BEFORE any call that could charge money.
-- A timeout is never an excuse to create a second intent after submission.
create function public.reserve_quote_payment(p_quote_id uuid, p_option_id uuid, p_attempt jsonb)
returns public.quote_payment_attempts language plpgsql security invoker set search_path = '' as $$
declare q public.quotes; a public.quote_payment_attempts; o public.quote_options;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found or q.payment_pricing_version is distinct from 1 or q.payment_status in ('paid','refunded')
    or q.converted_job_id is not null or q.stripe_checkout_session_id is not null
    or (q.expires_at is not null and q.expires_at < (now() at time zone 'America/New_York')::date) then
    raise exception 'This quote is not available for a new payment.';
  end if;
  select * into o from public.quote_options where id=p_option_id and quote_id=p_quote_id for update;
  if not found then
    raise exception 'Tire option does not belong to quote.';
  end if;
  if not (to_jsonb(q) @> (p_attempt->'source_quote')) or not (to_jsonb(o) @> (p_attempt->'source_option')) then
    raise exception 'Quote changed while calculating payment. Refresh and review again.';
  end if;
  update public.quote_payment_attempts set state='expired', updated_at=now()
    where quote_id=p_quote_id and state='review' and expires_at <= now();
  if exists(select 1 from public.quote_payment_attempts where quote_id=p_quote_id and state not in ('failed','canceled','expired')) then
    raise exception 'Payment is already being reviewed or processed. Resume the existing payment.';
  end if;
  insert into public.quote_payment_attempts(id,quote_id,option_id,confirmation_token,funding,payment_method_type,snapshot,tax_calculation_id,amount_cents,tax_cents,expires_at)
    values((p_attempt->>'id')::uuid,p_quote_id,p_option_id,p_attempt->>'confirmation_token',p_attempt->>'funding',p_attempt->>'payment_method_type',p_attempt->'snapshot',p_attempt->>'tax_calculation_id',(p_attempt->>'amount_cents')::integer,(p_attempt->>'tax_cents')::integer,(p_attempt->>'expires_at')::timestamptz)
    returning * into a;
  update public.quotes set selected_option_id=p_option_id, payment_status='pending', updated_at=now() where id=p_quote_id;
  return a;
end $$;
revoke all on function public.reserve_quote_payment(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_quote_payment(uuid,uuid,jsonb) to service_role;

create function public.submit_quote_payment(p_quote_id uuid, p_attempt_id uuid)
returns public.quote_payment_attempts language plpgsql security invoker set search_path = '' as $$
declare q public.quotes; a public.quote_payment_attempts;
begin
  select * into q from public.quotes where id=p_quote_id for update;
  select * into a from public.quote_payment_attempts where id=p_attempt_id and quote_id=p_quote_id for update;
  if a.id is null or q.payment_status in ('paid','refunded') or q.converted_job_id is not null then
    raise exception 'This quote cannot be charged.';
  end if;
  if a.state='review' then
    if a.expires_at <= now() or (q.expires_at is not null and q.expires_at < (now() at time zone 'America/New_York')::date) then raise exception 'Payment review expired. Review the total again.'; end if;
    update public.quote_payment_attempts set state='submitting', submitted_at=now(), updated_at=now() where id=a.id returning * into a;
  elsif a.state not in ('submitting','requires_action','requires_confirmation','processing','succeeded') then
    raise exception 'Review a new payment before continuing.';
  end if;
  return a;
end $$;
revoke all on function public.submit_quote_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.submit_quote_payment(uuid,uuid) to service_role;

-- All state transitions use the same quote-first lock order as reservation.
-- An old failure cannot clear the pending state of a newer attempt, and a
-- delayed response cannot turn an already succeeded attempt back into pending.
create function public.sync_quote_payment(p_quote_id uuid, p_attempt_id uuid, p_state text, p_intent_id text, p_method_id text)
returns public.quote_payment_attempts language plpgsql security invoker set search_path = '' as $$
declare a public.quote_payment_attempts;
begin
  perform 1 from public.quotes where id=p_quote_id for update;
  select * into a from public.quote_payment_attempts where id=p_attempt_id and quote_id=p_quote_id for update;
  if a.id is null or a.submitted_at is null or p_state not in ('requires_action','requires_confirmation','processing','succeeded','failed','canceled')
    or p_intent_id is null or (a.stripe_payment_intent_id is not null and a.stripe_payment_intent_id <> p_intent_id)
    or (a.stripe_payment_method_id is not null and p_method_id is not null and a.stripe_payment_method_id <> p_method_id) then
    raise exception 'Payment status does not match the submitted attempt.';
  end if;
  if a.state='succeeded' or (a.state in ('failed','canceled') and p_state <> 'succeeded') then return a; end if;
  update public.quote_payment_attempts set state=p_state, stripe_payment_intent_id=p_intent_id,
    stripe_payment_method_id=coalesce(p_method_id,stripe_payment_method_id), updated_at=now() where id=a.id returning * into a;
  if p_state in ('failed','canceled') and not exists (
    select 1 from public.quote_payment_attempts where quote_id=p_quote_id and state not in ('failed','canceled','expired')
  ) then
    update public.quotes set payment_status='unpaid', updated_at=now() where id=p_quote_id and payment_status='pending';
  end if;
  return a;
end $$;
revoke all on function public.sync_quote_payment(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.sync_quote_payment(uuid,uuid,text,text,text) to service_role;

create function public.cancel_quote_payment_review(p_quote_id uuid, p_attempt_id uuid)
returns public.quote_payment_attempts language plpgsql security invoker set search_path = '' as $$
declare a public.quote_payment_attempts;
begin
  perform 1 from public.quotes where id=p_quote_id for update;
  update public.quote_payment_attempts set state='canceled', updated_at=now()
    where id=p_attempt_id and quote_id=p_quote_id and state='review' and submitted_at is null returning * into a;
  if a.id is null then raise exception 'This payment has already been submitted. Check its status before continuing.'; end if;
  update public.quotes set payment_status='unpaid', updated_at=now() where id=p_quote_id and payment_status='pending';
  return a;
end $$;
revoke all on function public.cancel_quote_payment_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_quote_payment_review(uuid,uuid) to service_role;

-- Freeze the purchased details while a payment can still succeed. This covers
-- staff edits and option edits as well as simultaneous browser submissions.
create function public.protect_payment_quote_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null and coalesce(current_setting('role',true),'') <> 'service_role' and session_user <> 'postgres' then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.quote_payment_attempts where quote_id=old.id and state not in ('failed','canceled','expired')) and exists (
    select 1 from unnest(array['quantity','rear_quantity','tire_size','rear_tire_size','installation_cost','service_call_fee','disposal_fee','ny_state_tire_fee','tax_exempt','additional_items','customer','contact_name','email','phone','address','vehicle','requested_date','requested_time','discount_code_id','discount_code_label','discount_type','discount_percent','discount_fixed_amount','discount_organization','purchase_source','checkout_service','payment_pricing_version']) as frozen(field)
    where (to_jsonb(old)->frozen.field) is distinct from (to_jsonb(new)->frozen.field)
  ) then
    raise exception 'Quote details cannot change while a payment is under review, processing, or paid.';
  end if;
  return new;
end $$;
-- Trigger must read the service-only attempts table for authenticated staff.
-- Scoped definer is necessary here; it has no arguments and only rejects writes.
alter function public.protect_payment_quote_snapshot() security definer;
revoke all on function public.protect_payment_quote_snapshot() from public,anon,authenticated;
create trigger protect_payment_quote_snapshot before update on public.quotes for each row execute function public.protect_payment_quote_snapshot();
create function public.protect_payment_option_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and coalesce(current_setting('role',true),'') <> 'service_role' and session_user <> 'postgres' then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.quote_payment_attempts where quote_id=old.quote_id and state not in ('failed','canceled','expired')) then
    raise exception 'Tire options cannot change while a payment is under review, processing, or paid.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_payment_option_snapshot() from public,anon,authenticated;
create trigger protect_payment_option_snapshot before update or delete on public.quote_options for each row execute function public.protect_payment_option_snapshot();
