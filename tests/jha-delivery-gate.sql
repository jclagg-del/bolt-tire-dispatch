begin;
create temporary table jha_delivery_gate_test (
 id text primary key, service_type text, complete boolean default false,
 job_status text, customer_order_status text, completed_at timestamptz
) on commit drop;
create trigger test_jha_gate before insert or update on jha_delivery_gate_test
for each row execute function public.require_jha_before_job_complete();
grant select,insert,update on jha_delivery_gate_test to authenticated;
set local role authenticated;
do $test$
declare service text; target_field text; test_id text; accepted integer:=0; rejected integer:=0;
begin
 foreach service in array array['Delivery','delivery',' delivered ',E'  DELIVERY\t  ','delivery_pickup','delivery / pickup','delivery/pickup','delivery and pickup','Installation','repair','General Service','Delivery and Installation','Pickup','',null] loop
  foreach target_field in array array['complete','job_status','customer_order_status','completed_at'] loop
   test_id='jha-exemption-fixture-'||gen_random_uuid()::text;
   insert into jha_delivery_gate_test(id,service_type) values(test_id,service);
   begin
    case target_field
     when 'complete' then update jha_delivery_gate_test set complete=true where id=test_id;
     when 'job_status' then update jha_delivery_gate_test set job_status='completed' where id=test_id;
     when 'customer_order_status' then update jha_delivery_gate_test set customer_order_status='Work Completed' where id=test_id;
     when 'completed_at' then update jha_delivery_gate_test set completed_at=now() where id=test_id;
    end case;
    if service is null or service in ('Installation','repair','General Service','Delivery and Installation','Pickup','') then
     raise exception 'Unexpected exemption for % / %',service,target_field;
    end if;
    accepted=accepted+1;
   exception when check_violation then
    if service is not null and service not in ('Installation','repair','General Service','Delivery and Installation','Pickup','') then
     raise exception 'Delivery incorrectly blocked: % / %',service,target_field;
    end if;
    rejected=rejected+1;
   end;
  end loop;
 end loop;
 if accepted<>32 or rejected<>28 then raise exception 'Wrong counts: accepted %, rejected %',accepted,rejected; end if;
end;
$test$;
reset role;
select 'PASS: 32 delivery completion paths allowed; 28 non-delivery paths blocked; authenticated role; no real jobs changed' as result;
rollback;
