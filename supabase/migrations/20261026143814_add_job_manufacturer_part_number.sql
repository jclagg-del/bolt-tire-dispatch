-- Keep supplier order identifiers separate from the manufacturer's part number.
alter table public.jobs add column if not exists tire_manufacturer_part_number text;
comment on column public.jobs.tire_manufacturer_part_number is 'Manufacturer part number snapshot; never a UPC or an unverified supplier SKU.';

-- Recover exact saved ATD manufacturer identifiers only when the job still
-- carries the same single-axle supplier part as the selected quote option.
update public.jobs j set tire_manufacturer_part_number = o.manufacturer_product_id
from public.quotes q join public.quote_options o on o.id=q.selected_option_id and o.quote_id=q.id
where (j.source_quote_id=q.id or j.id=q.converted_job_id)
  and j.tire_manufacturer_part_number is null
  and upper(trim(o.supplier))='ATD'
  and nullif(trim(o.manufacturer_product_id),'') is not null
  and coalesce(q.rear_quantity,0)=0
  and j.tire_product_number=o.supplier_product_id;

-- USAF part_number is distinct from UPC. Exact part identity only; no model,
-- size, or approximate text matching and no changes to supplier ordering IDs.
update public.jobs j set tire_manufacturer_part_number=u.part_number
from public.usaf_inventory u
where j.tire_manufacturer_part_number is null and j.tire_product_number=u.part_number;
