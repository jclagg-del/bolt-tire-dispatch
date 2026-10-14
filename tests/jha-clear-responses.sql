-- Rollback-only fixtures: no real jobs or assessments are modified.
begin;
create temporary table jha_clear_response_test (
 id text primary key, service_type text, complete boolean default false,
 job_status text, customer_order_status text, completed_at timestamptz
) on commit drop;
create trigger test_jha_gate before insert or update on jha_clear_response_test
for each row execute function public.require_jha_before_job_complete();
grant select,insert,update on jha_clear_response_test to authenticated;
do $test$
declare reason text; test_id text; assessment jsonb; ctx jsonb; patch jsonb;
begin
 foreach reason in array array['','safe',' SAFE! ','None.','n/a','NA','No hazards','No   unresolved hazards.','no issues','Not applicable'] loop
  assessment=jsonb_build_object('technician','Test only','steps',jsonb_build_array(jsonb_build_object(
   'task','Inspect','hazards','safe','controls','Work area checked','controlled',true)),
   'glasses',true,'hearing',true,'acknowledged',true,'unsafeReason',reason,'photos','[]'::jsonb);
  if not public.jha_valid_complete(assessment) then raise exception 'Clear response rejected: %',reason; end if;
  foreach patch in array array['{"technician":""}'::jsonb,'{"glasses":false}'::jsonb,
   '{"hearing":false}'::jsonb,'{"acknowledged":false}'::jsonb,'{"steps":[]}'::jsonb] loop
   if public.jha_valid_complete(assessment || patch) then raise exception 'Missing requirement accepted: %',patch; end if;
  end loop;
  test_id='jha-clear-fixture-'||gen_random_uuid()::text;
  insert into jha_clear_response_test(id,service_type) values(test_id,'Installation');
  select public.jha_job_context(to_jsonb(j)) into ctx from jha_clear_response_test j where id=test_id;
  insert into public.job_jhas(job_id,status,assessment,context) values(test_id,'complete',assessment,ctx);
 end loop;
 foreach reason in array array['not safe','unsafe','safe except for traffic','no controls','none yet','traffic hazard'] loop
  assessment=jsonb_set(assessment,'{unsafeReason}',to_jsonb(reason));
  if public.jha_valid_complete(assessment) then raise exception 'Actual hold accepted: %',reason; end if;
 end loop;
end;
$test$;
set local role authenticated;
update jha_clear_response_test set complete=true,job_status='completed',customer_order_status='Work Completed',completed_at=now();
do $test$
begin
 if (select count(*) from jha_clear_response_test where complete)<>10 then raise exception 'Not all clear responses completed'; end if;
 begin
  insert into jha_clear_response_test(id,service_type,complete) values('jha-missing-'||gen_random_uuid()::text,'Installation',true);
  raise exception 'Missing JHA bypassed completion gate';
 exception when check_violation then null;
 end;
end;
$test$;
reset role;
select 'PASS: clear responses accepted, required fields retained, real holds rejected, authenticated completion allowed, missing JHA blocked; all fixtures rolled back' as result;
rollback;
