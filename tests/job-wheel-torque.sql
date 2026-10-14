-- Run in isolated QA. This transaction creates only a synthetic job and rolls back.
begin;
do $test$
declare fixture_id bigint; bad numeric;
begin
 insert into public.jobs(customer,service_type,complete,wheel_torque_ft_lb)
 values('Wheel torque QA - rollback only','Installation',false,150.5) returning id into fixture_id;
 if (select wheel_torque_ft_lb from public.jobs where id=fixture_id) is distinct from 150.5::numeric then
  raise exception 'Torque value did not persist';
 end if;
 foreach bad in array array[0::numeric,-10::numeric,'NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric] loop
  begin
   update public.jobs set wheel_torque_ft_lb=bad where id=fixture_id;
   raise exception 'Invalid torque accepted: %',bad;
  exception when check_violation then null;
  end;
 end loop;
 update public.jobs set wheel_torque_ft_lb=null where id=fixture_id;
 if (select wheel_torque_ft_lb from public.jobs where id=fixture_id) is not null then raise exception 'Blank value not preserved'; end if;
end;
$test$;
select 'PASS: decimal torque persisted; zero, negative and nonfinite values rejected; blank accepted; fixtures rolled back' as result;
rollback;
