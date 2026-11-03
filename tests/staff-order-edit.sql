-- Run only after loading the migration into an isolated QA schema, as described
-- in docs/staff-order-edit.md. This file refers exclusively to that schema.
insert into bolt_staff_order_edit_qa.customer_orders(id,customer,contact_name,contact_number,address,qty,tire_size,job_number,mo_number,tire_product_number)
values(-101,'Kingdom Support Services','QA Contact','5550100','QA Address',4,'235/65R16','00123','00456','PART1');
do $$
declare snapshot jsonb; after_save jsonb; request_id uuid := '11111111-1111-4111-8111-111111111111';
begin
  select to_jsonb(o) into snapshot from bolt_staff_order_edit_qa.customer_orders o where id=-101;
  perform bolt_staff_order_edit_qa.staff_edit_fleet_order(-101,snapshot,'{"submitted_by":"Office edit","license_plate":"QA123","tire_position":"Left rear","notes":"Corrected"}',request_id);
  select to_jsonb(o) into after_save from bolt_staff_order_edit_qa.customer_orders o where id=-101;
  assert after_save->>'submitted_by'='Office edit' and after_save->>'license_plate'='QA123' and after_save->>'tire_position'='Left rear';
  assert after_save->>'order_status'='new' and after_save->>'approved_job_id' is null;
  assert (after_save - array['submitted_by','license_plate','tire_position','notes','reviewed_at']) = (snapshot - array['submitted_by','license_plate','tire_position','notes','reviewed_at']);
  assert after_save->>'reviewed_at' is not null;
  begin
    perform bolt_staff_order_edit_qa.staff_edit_fleet_order(-101,snapshot,'{"notes":"stale"}',request_id);
    raise exception using errcode='XX000',message='stale edit should fail';
  exception when raise_exception then null; end;
  -- A stale supplier preview cannot claim or submit a purchase after an edit.
  begin
    insert into bolt_staff_order_edit_qa.supplier_orders(request_id,supplier,atd_product_number,quantity,customer_po_number,response)
    values(request_id,'QA','PART1',2,'00123','{"customerOrderId":-101,"jobId":null,"requestedPart":"PART1"}');
    raise exception using errcode='XX000',message='stale purchase should fail';
  exception when raise_exception then null; end;
  assert not exists(select 1 from bolt_staff_order_edit_qa.supplier_orders);
  insert into bolt_staff_order_edit_qa.supplier_orders(request_id,supplier,atd_product_number,quantity,customer_po_number,response)
  values(request_id,'QA','PART1',4,'00123','{"customerOrderId":-101,"jobId":null,"requestedPart":"PART1"}');
  begin
    perform bolt_staff_order_edit_qa.staff_edit_fleet_order(-101,after_save,'{"qty":2}',request_id);
    raise exception using errcode='XX000',message='purchased quantity should be locked';
  exception when raise_exception then null; end;
  perform bolt_staff_order_edit_qa.staff_edit_fleet_order(-101,after_save,'{"contact_name":"Correct contact"}',request_id);
  update bolt_staff_order_edit_qa.customer_orders set order_status='approved' where id=-101;
  select to_jsonb(o) into snapshot from bolt_staff_order_edit_qa.customer_orders o where id=-101;
  begin
    perform bolt_staff_order_edit_qa.staff_edit_fleet_order(-101,snapshot,'{"notes":"too late"}',request_id);
    raise exception using errcode='XX000',message='approved edit should fail';
  exception when raise_exception then null; end;
  update bolt_staff_order_edit_qa.customer_orders set order_status='new',payment_status='paid' where id=-101;
  select to_jsonb(o) into snapshot from bolt_staff_order_edit_qa.customer_orders o where id=-101;
  begin
    perform bolt_staff_order_edit_qa.staff_edit_fleet_order(-101,snapshot,'{"notes":"paid"}',request_id);
    raise exception using errcode='XX000',message='paid edit should fail';
  exception when raise_exception then null; end;
  assert not has_function_privilege('anon','bolt_staff_order_edit_qa.staff_edit_fleet_order(bigint,jsonb,jsonb,uuid)','execute');
  assert not has_function_privilege('authenticated','bolt_staff_order_edit_qa.staff_edit_fleet_order(bigint,jsonb,jsonb,uuid)','execute');
  assert has_function_privilege('service_role','bolt_staff_order_edit_qa.staff_edit_fleet_order(bigint,jsonb,jsonb,uuid)','execute');
end $$;
