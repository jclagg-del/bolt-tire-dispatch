alter table public.quotes
  alter column converted_job_id type bigint
  using case
    when converted_job_id::text ~ '^[0-9]+$' then converted_job_id::text::bigint
    else null
  end;
