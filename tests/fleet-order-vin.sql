-- Run against an isolated bolt_fleet_vin_qa schema containing empty LIKE copies
-- of customer_orders/supplier_orders and the migration's schema-rewritten RPC.
-- No real order/job is updated, and the caller removes only this new QA schema.
insert into bolt_fleet_vin_qa.customer_orders(id,customer,contact_name,contact_number,address,qty,tire_size,job_number,mo_number,tire_product_number)
values(-101,'Kingdom Support Services','QA Contact','5550100','QA Address',4,'235/65R16','00123','00456','PART1');
do $$
declare before_row jsonb; after_row jsonb; request_id uuid := '11111111-1111-4111-8111-111111111111';
begin
  select to_jsonb(o) into before_row from bolt_fleet_vin_qa.customer_orders o where id=-101;
  perform bolt_fleet_vin_qa.staff_edit_fleet_order(-101,before_row,'{"vin":"00123456789ABCDEF","license_plate":"QA123"}',request_id);
  select to_jsonb(o) into after_row from bolt_fleet_vin_qa.customer_orders o where id=-101;
  assert after_row->>'vin'='00123456789ABCDEF' and after_row->>'license_plate'='QA123';
  assert (after_row - array['vin','license_plate','reviewed_at']) = (before_row - array['vin','license_plate','reviewed_at']);
  begin
    perform bolt_fleet_vin_qa.staff_edit_fleet_order(-101,before_row,'{"vin":"STALE"}',request_id);
    raise exception using errcode='XX000', message='Stale edit should fail';
  exception when raise_exception then null; end;
  perform bolt_fleet_vin_qa.staff_edit_fleet_order(-101,after_row,'{"notes":"Unrelated edit"}',request_id);
  assert (select vin='00123456789ABCDEF' from bolt_fleet_vin_qa.customer_orders where id=-101);
  select to_jsonb(o) into before_row from bolt_fleet_vin_qa.customer_orders o where id=-101;
  perform bolt_fleet_vin_qa.staff_edit_fleet_order(-101,before_row,'{"vin":null}',request_id);
  assert (select vin is null and license_plate='QA123' from bolt_fleet_vin_qa.customer_orders where id=-101);
  update bolt_fleet_vin_qa.customer_orders set payment_status='paid' where id=-101;
  select to_jsonb(o) into before_row from bolt_fleet_vin_qa.customer_orders o where id=-101;
  begin
    perform bolt_fleet_vin_qa.staff_edit_fleet_order(-101,before_row,'{"vin":"PAID"}',request_id);
    raise exception using errcode='XX000', message='Paid edit should fail';
  exception when raise_exception then null; end;
  assert not has_function_privilege('anon','bolt_fleet_vin_qa.staff_edit_fleet_order(bigint,jsonb,jsonb,uuid)','execute');
  assert not has_function_privilege('authenticated','bolt_fleet_vin_qa.staff_edit_fleet_order(bigint,jsonb,jsonb,uuid)','execute');
  assert has_function_privilege('service_role','bolt_fleet_vin_qa.staff_edit_fleet_order(bigint,jsonb,jsonb,uuid)','execute');
end $$;
