-- Keep the customer-entered model separate from tire size and supplier part number.
-- Nullable and optional: existing orders are not parsed or rewritten.
alter table public.customer_orders add column if not exists tire_model text;

-- Staff API only. Save and supplier claiming serialize on the customer order.
-- No existing orders, jobs, payments or facility records are rewritten.
create or replace function public.staff_edit_fleet_order(p_id bigint, p_expected jsonb, p_changes jsonb, p_request_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_order public.customer_orders%rowtype;
  edited public.customer_orders%rowtype;
begin
  select * into current_order from public.customer_orders where id = p_id for update;
  if not found or to_jsonb(current_order) is distinct from p_expected then
    raise exception 'This order changed. Reload it before saving; no changes were applied.';
  end if;
  if current_order.customer not in ('Kingdom Support Services', 'HPR') or current_order.order_status is distinct from 'new'
    or current_order.approved_job_id is not null or current_order.source_quote_id is not null
    or current_order.payment_status = 'paid' or coalesce(current_order.amount_paid, 0) > 0
    or coalesce(jsonb_array_length(current_order.tire_items), 0) > 0 then
    raise exception 'Only unaccepted, unpaid fleet portal orders can be edited.';
  end if;
  edited := jsonb_populate_record(current_order, p_changes);
  if (current_order.tires_ordered or exists (select 1 from public.supplier_orders where request_id = p_request_id))
    and row(current_order.customer,current_order.goodyear_order,current_order.job_number,current_order.mo_number,current_order.qty,current_order.tire_size,current_order.tire_product_number)
      is distinct from row(edited.customer,edited.goodyear_order,edited.job_number,edited.mo_number,edited.qty,edited.tire_size,edited.tire_product_number) then
    raise exception 'A supplier purchase exists. Tire, quantity, organization and reference fields cannot be changed.';
  end if;
  update public.customer_orders set
    customer=edited.customer, goodyear_order=edited.goodyear_order, service_method=edited.service_method,
    submitted_by=edited.submitted_by, contact_name=edited.contact_name, contact_number=edited.contact_number,
    facility_id=edited.facility_id, facility_name=edited.facility_name, address=edited.address,
    requested_date=edited.requested_date, requested_time=edited.requested_time,
    vehicle_year=edited.vehicle_year, vehicle_make=edited.vehicle_make, vehicle_model=edited.vehicle_model,
    vehicle_color=edited.vehicle_color, license_plate=edited.license_plate,
    job_number=edited.job_number, mo_number=edited.mo_number, tire_position=edited.tire_position,
    qty=edited.qty, tire_size=edited.tire_size, tire_product_number=edited.tire_product_number, tire_model=edited.tire_model, notes=edited.notes,
    -- Approval already compares reviewed_at when claiming the order; invalidate stale approval reads.
    reviewed_at=clock_timestamp()
  where id=p_id;
end $$;
revoke all on function public.staff_edit_fleet_order(bigint,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.staff_edit_fleet_order(bigint,jsonb,jsonb,uuid) to service_role;
