-- Save one appointment and its route position in a single transaction.
-- Only the staff-authorized API may invoke this routine.
create or replace function public.reschedule_route_stop(
  p_date date, p_vehicle_id text, p_job_ids jsonb, p_revision integer,
  p_job_id bigint, p_expected_scheduled timestamp without time zone,
  p_scheduled timestamp without time zone
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_created boolean := false;
  v_revision integer;
  v_ids jsonb;
  v_current text[];
  v_requested text[];
  v_job public.jobs%rowtype;
begin
  if p_date is null or p_date <> (now() at time zone 'America/New_York')::date
    or p_scheduled is null or p_scheduled::date < p_date
    or p_expected_scheduled is null or p_expected_scheduled::date <> p_date
    or p_vehicle_id is null or length(p_vehicle_id) not between 1 and 100
    or p_revision is null or p_revision < 0 or p_job_id is null
    or p_job_ids is null or jsonb_typeof(p_job_ids) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid route appointment';
  end if;
  if jsonb_array_length(p_job_ids) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Invalid route size';
  end if;
  select array_agg(value order by value) into v_requested from jsonb_array_elements_text(p_job_ids);
  if exists (select 1 from jsonb_array_elements(p_job_ids) item where jsonb_typeof(item) <> 'string')
    or exists (select 1 from unnest(v_requested) id where id !~ '^[0-9]+$')
    or cardinality(v_requested) <> (select count(distinct id) from unnest(v_requested) id)
    or not (p_job_id::text = any(v_requested)) then
    raise exception using errcode = '22023', message = 'Invalid route stops';
  end if;

  -- All callers lock today's route first, then jobs in ID order. Future routes
  -- are locked last. No external calls are made while holding these locks.
  if p_revision = 0 then
    insert into public.route_day_orders(route_date, vehicle_id, job_ids, revision)
      values (p_date, p_vehicle_id, '[]'::jsonb, 1)
      on conflict do nothing returning true into v_created;
  end if;
  select revision into v_revision from public.route_day_orders
    where route_date = p_date and vehicle_id = p_vehicle_id for update;
  if v_revision is null or (not coalesce(v_created, false) and v_revision <> p_revision) then
    raise exception using errcode = '40001', message = 'Route changed';
  end if;
  perform id from public.jobs
    where scheduled::date = p_date and coalesce(vehicle_id, 'stepvan') = p_vehicle_id
      and not coalesce(complete, false) and not coalesce(archived, false)
    order by id for update;
  select array_agg(id::text order by id::text) into v_current from public.jobs
    where scheduled::date = p_date and coalesce(vehicle_id, 'stepvan') = p_vehicle_id
      and not coalesce(complete, false) and not coalesce(archived, false);
  if v_current is distinct from v_requested then
    raise exception using errcode = '40001', message = 'Route jobs changed';
  end if;
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.scheduled is distinct from p_expected_scheduled
    or coalesce(v_job.complete, false) or coalesce(v_job.archived, false)
    or coalesce(v_job.vehicle_id, 'stepvan') <> p_vehicle_id then
    raise exception using errcode = '40001', message = 'Appointment changed';
  end if;

  update public.jobs set scheduled = p_scheduled where id = p_job_id;
  v_ids := p_job_ids;
  if p_scheduled::date <> p_date then
    select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) into v_ids
      from jsonb_array_elements(p_job_ids) with ordinality as stops(value, ord)
      where value <> to_jsonb(p_job_id::text);
    -- A future route may already have an old position for this job. Remove it
    -- so the newly scheduled stop is treated like other new arrivals that day.
    update public.route_day_orders set job_ids = job_ids - p_job_id::text, revision = revision + 1
      where route_date = p_scheduled::date and vehicle_id = p_vehicle_id
        and job_ids ? p_job_id::text;
  end if;
  update public.route_day_orders set job_ids = v_ids, revision = p_revision + 1
    where route_date = p_date and vehicle_id = p_vehicle_id;
  return jsonb_build_object(
    'order', jsonb_build_object('vehicle_id', p_vehicle_id, 'job_ids', v_ids, 'revision', p_revision + 1),
    'job', jsonb_build_object('id', p_job_id::text, 'scheduled', p_scheduled)
  );
end;
$$;
revoke all on function public.reschedule_route_stop(date,text,jsonb,integer,bigint,timestamp without time zone,timestamp without time zone) from public, anon, authenticated;
grant execute on function public.reschedule_route_stop(date,text,jsonb,integer,bigint,timestamp without time zone,timestamp without time zone) to service_role;
