-- Run only in the isolated QA project. Fixtures are rolled back.
begin;
do $$
declare
  day date := (now() at time zone 'America/New_York')::date;
  vehicle text := 'route-reschedule-qa-' || gen_random_uuid()::text;
  first_id bigint;
  second_id bigint;
  ids jsonb;
  result jsonb;
  stamp timestamp without time zone;
begin
  insert into public.jobs(customer, scheduled, vehicle_id) values ('QA route stop one', day + time '09:00', vehicle) returning id into first_id;
  insert into public.jobs(customer, scheduled, vehicle_id) values ('QA route stop two', day + time '10:00', vehicle) returning id into second_id;
  ids := jsonb_build_array(second_id::text, first_id::text);
  begin
    perform public.reschedule_route_stop(day, vehicle, jsonb_build_array(first_id::text), 0, first_id, day + time '09:00', day + time '11:00');
    raise exception 'Missing stop was accepted';
  exception when serialization_failure then null;
  end;
  if exists(select 1 from public.route_day_orders where vehicle_id = vehicle) then raise exception 'Failed save left route row behind'; end if;
  result := public.reschedule_route_stop(day, vehicle, ids, 0, first_id, day + time '09:00', day + time '10:30');
  if result #>> '{order,revision}' <> '1' or result #> '{order,job_ids}' <> ids then raise exception 'Order not saved'; end if;
  select scheduled into stamp from public.jobs where id = first_id;
  if stamp <> day + time '10:30' then raise exception 'Moved time not saved'; end if;
  select scheduled into stamp from public.jobs where id = second_id;
  if stamp <> day + time '10:00' then raise exception 'Other appointment changed'; end if;
  begin
    perform public.reschedule_route_stop(day, vehicle, ids, 0, first_id, day + time '10:30', day + time '11:00');
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.reschedule_route_stop(day, vehicle, ids, 1, first_id, day + time '09:00', day + time '11:00');
    raise exception 'Stale appointment was accepted';
  exception when serialization_failure then null;
  end;
  if (select revision from public.route_day_orders where vehicle_id = vehicle and route_date = day) <> 1 then raise exception 'Conflict modified order'; end if;
  if (select scheduled from public.jobs where id = first_id) <> day + time '10:30' then raise exception 'Conflict modified time'; end if;
  update public.jobs set archived = true where id = first_id;
  begin
    perform public.reschedule_route_stop(day, vehicle, ids, 1, first_id, day + time '10:30', day + time '11:00');
    raise exception 'Archived job was accepted';
  exception when serialization_failure then null;
  end;
  update public.jobs set archived = false where id = first_id;
  insert into public.route_day_orders(route_date,vehicle_id,job_ids,revision) values (day + 1,vehicle,jsonb_build_array(first_id::text),1);
  result := public.reschedule_route_stop(day, vehicle, ids, 1, first_id, day + time '10:30', day + 1 + time '14:15');
  if result #> '{order,job_ids}' <> jsonb_build_array(second_id::text) then raise exception 'Future appointment remained on source route'; end if;
  if (select scheduled from public.jobs where id = first_id) <> day + 1 + time '14:15' then raise exception 'Future time not saved'; end if;
  if (select job_ids from public.route_day_orders where route_date = day + 1 and vehicle_id = vehicle) <> '[]'::jsonb then raise exception 'Stale future position remains'; end if;
  if has_function_privilege('anon', 'public.reschedule_route_stop(date,text,jsonb,integer,bigint,timestamp without time zone,timestamp without time zone)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.reschedule_route_stop(date,text,jsonb,integer,bigint,timestamp without time zone,timestamp without time zone)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.reschedule_route_stop(date,text,jsonb,integer,bigint,timestamp without time zone,timestamp without time zone)', 'EXECUTE') then
    raise exception 'Incorrect routine privileges';
  end if;
end;
$$;
select 'PASS: appointment, other jobs, conflicts, rollback, future route and service-only permissions' as result;
rollback;
