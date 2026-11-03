-- READ ONLY. Candidate report, NOT authorization or proof that a blank was
-- unintentional. See docs/kss-order-job-mapping.md before any future repair.
with links as (
  select approved_job_id, count(*) as order_links
  from public.customer_orders
  where approved_job_id is not null
  group by approved_job_id
)
select o.id as order_id, j.id as job_id, o.customer,
       f.field, f.job_value, f.order_value,
       j.complete, j.archived, j.job_status, j.payment_status,
       o.source_quote_id, l.order_links,
       case
         when nullif(btrim(f.job_value), '') is not null then 'preserve_populated_field'
         when l.order_links <> 1 then 'review_ambiguous_link'
         when j.customer is distinct from o.customer then 'review_customer_mismatch'
         when o.source_quote_id is not null or j.source_quote_id is not null then 'review_paid_quote_link'
         when j.complete is true or j.archived is true then 'review_closed_job'
         else 'review_blank_field'
       end as disposition
from public.customer_orders o
join public.jobs j on j.id = o.approved_job_id
join links l on l.approved_job_id = j.id
cross join lateral (values
  ('submitted_by', j.submitted_by, o.submitted_by),
  ('tire_position', j.tire_position, o.tire_position),
  ('license_plate', j.license_plate, o.license_plate),
  ('vehicle_year', j.vehicle_year, o.vehicle_year),
  ('vehicle_make', j.vehicle_make, o.vehicle_make),
  ('vehicle_model', j.vehicle_model, o.vehicle_model),
  ('vehicle_color', j.vehicle_color, o.vehicle_color)
) as f(field, job_value, order_value)
where o.customer in ('Kingdom Support Services', 'HPR')
  and o.order_status = 'approved'
  and nullif(btrim(f.order_value), '') is not null
  and nullif(btrim(f.job_value), '') is distinct from nullif(btrim(f.order_value), '')
order by o.id, f.field;
