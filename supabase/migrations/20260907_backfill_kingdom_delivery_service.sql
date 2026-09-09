update public.customer_orders
set service_method = 'delivery'
where lower(coalesce(service_method, '')) = 'delivered';

update public.jobs j
set service_type = 'Delivery'
from public.customer_orders o
where o.approved_job_id = j.id
  and lower(coalesce(o.service_method, '')) in ('delivery', 'delivered', 'delivery_pickup');
