alter table public.jobs
  add column if not exists created_at timestamptz;

alter table public.jobs
  alter column created_at set default now();

comment on column public.jobs.created_at is
  'Time the job was created. Existing jobs remain null because their original creation time was not recorded.';
