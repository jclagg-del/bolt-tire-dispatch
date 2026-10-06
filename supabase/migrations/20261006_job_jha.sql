begin;

-- Jobs and service tasks share public.jobs. No historical job is rewritten.
create table if not exists public.job_jhas (
  job_id text primary key,
  revision integer not null default 1,
  status text not null check (status in ('draft','complete','unsafe')),
  assessment jsonb not null,
  context jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.job_jha_history (
  id bigint generated always as identity primary key,
  job_id text not null,
  revision integer not null,
  status text not null,
  assessment jsonb not null,
  context jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null,
  completed_at timestamptz,
  unique(job_id,revision)
);
create table if not exists public.job_jha_photos (
  path text primary key,
  job_id text not null,
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now()
);
alter table public.job_jhas enable row level security;
alter table public.job_jha_history enable row level security;
alter table public.job_jha_photos enable row level security;
revoke all on public.job_jhas, public.job_jha_history, public.job_jha_photos from anon, authenticated;
grant select,insert,update on public.job_jhas to service_role;
grant select,insert on public.job_jha_history, public.job_jha_photos to service_role;
grant usage,select on sequence public.job_jha_history_id_seq to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('job-jha-photos','job-jha-photos',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
-- No public or authenticated storage policies: staff API issues short-lived URLs.

create or replace function public.jha_job_context(job jsonb) returns jsonb
language sql immutable set search_path=public as $$
select jsonb_build_object('service_type',job->'service_type','address',job->'address',
 'scheduled',job->'scheduled','vehicle',job->'vehicle','tires',job->'tires','size',job->'size','qty',job->'qty');
$$;
create or replace function public.jha_valid_complete(a jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare item jsonb;
begin
 if coalesce(length(trim(a->>'technician')),0)=0 or a->'glasses' is distinct from 'true'::jsonb
 or a->'hearing' is distinct from 'true'::jsonb or a->'acknowledged' is distinct from 'true'::jsonb
 or coalesce(length(trim(a->>'unsafeReason')),0)>0 then return false; end if;
 if jsonb_typeof(a->'steps') is distinct from 'array' then return false; end if;
 if jsonb_array_length(a->'steps') not between 1 and 20 then return false; end if;
 for item in select value from jsonb_array_elements(a->'steps') loop
  if coalesce(length(trim(item->>'task')),0)=0 or coalesce(length(trim(item->>'hazards')),0)=0
  or coalesce(length(trim(item->>'controls')),0)=0 or item->'controlled' is distinct from 'true'::jsonb then return false; end if;
 end loop;
 return true;
end; $$;

create or replace function public.archive_job_jha_revision() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.job_jha_history(job_id,revision,status,assessment,context,updated_by,updated_at,completed_at)
 values(new.job_id,new.revision,new.status,new.assessment,new.context,new.updated_by,new.updated_at,new.completed_at);
 return new;
end; $$;
drop trigger if exists archive_job_jha_revision on public.job_jhas;
create trigger archive_job_jha_revision after insert or update on public.job_jhas for each row execute function public.archive_job_jha_revision();

create or replace function public.save_job_jha(p_job_id text,p_revision integer,p_status text,p_assessment jsonb,p_user uuid,p_context jsonb)
returns public.job_jhas language plpgsql security definer set search_path=public as $$
declare job jsonb; current_revision integer; result public.job_jhas; photo jsonb;
begin
 -- Serialize JHA changes with job completion and other JHA saves.
 select to_jsonb(j) into job from public.jobs j where j.id::text=p_job_id for update;
 if job is null then raise exception 'Job not found'; end if;
 if coalesce((job->>'complete')::boolean,false) or coalesce((job->>'archived')::boolean,false) then raise exception 'Completed or archived work is read-only. Reopen the job before changing its JHA.'; end if;
 if p_context is distinct from public.jha_job_context(job) then raise exception 'Job details changed. Reload the JHA and reassess.'; end if;
 if not exists(select 1 from public.staff_security where user_id=p_user and role in ('admin','office','technician')) then raise exception 'Staff access required'; end if;
 select revision into current_revision from public.job_jhas where job_id=p_job_id;
 if coalesce(current_revision,0)<>p_revision then raise exception 'JHA changed. Reload before saving.'; end if;
 if p_status not in ('draft','complete','unsafe') then raise exception 'Invalid JHA status'; end if;
 if p_status='complete' and not public.jha_valid_complete(p_assessment) then raise exception 'Complete all JHA steps, required PPE and acknowledgment first.'; end if;
 if p_status='unsafe' and coalesce(length(trim(p_assessment->>'unsafeReason')),0)=0 then raise exception 'Describe the unresolved hazard.'; end if;
 if jsonb_typeof(p_assessment->'photos') is distinct from 'array' then raise exception 'Invalid photos'; end if;
 if jsonb_array_length(p_assessment->'photos')>12 then raise exception 'Maximum 12 photos'; end if;
 for photo in select value from jsonb_array_elements(p_assessment->'photos') loop
  if not exists(select 1 from public.job_jha_photos where job_id=p_job_id and path=photo->>'path') then raise exception 'Photo does not belong to this job'; end if;
 end loop;
 insert into public.job_jhas(job_id,revision,status,assessment,context,updated_by,updated_at,completed_at)
 values(p_job_id,p_revision+1,p_status,p_assessment,p_context,p_user,now(),case when p_status='complete' then now() else null end)
 on conflict(job_id) do update set revision=excluded.revision,status=excluded.status,assessment=excluded.assessment,
 context=excluded.context,updated_by=excluded.updated_by,updated_at=excluded.updated_at,completed_at=excluded.completed_at returning * into result;
 return result;
end; $$;
revoke all on function public.save_job_jha(text,integer,text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_job_jha(text,integer,text,jsonb,uuid,jsonb) to service_role;

create or replace function public.require_jha_before_job_complete() returns trigger
language plpgsql security definer set search_path=public as $$
declare old_job jsonb; new_job jsonb; jha public.job_jhas; finishing boolean;
begin
 new_job=to_jsonb(new); old_job=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 finishing=(coalesce((new_job->>'complete')::boolean,false) and not coalesce((old_job->>'complete')::boolean,false))
 or (new_job->>'job_status'='completed' and old_job->>'job_status' is distinct from 'completed')
 or (new_job->>'customer_order_status'='Work Completed' and old_job->>'customer_order_status' is distinct from 'Work Completed')
 or (new_job->>'completed_at' is not null and old_job->>'completed_at' is null);
 if finishing then
  select * into jha from public.job_jhas where job_id=new.id::text;
  if jha.job_id is null or jha.status<>'complete' or not public.jha_valid_complete(jha.assessment)
  or jha.context is distinct from public.jha_job_context(new_job) then
   raise exception 'Complete the JHA for the current job details before completing this job or task.' using errcode='23514';
  end if;
 end if;
 if tg_op='UPDATE' and coalesce((old_job->>'complete')::boolean,false) and not coalesce((new_job->>'complete')::boolean,false) then
  update public.job_jhas set status='draft',revision=revision+1,completed_at=null,updated_at=now(),updated_by=auth.uid(),
   assessment=jsonb_set(assessment,'{acknowledged}','false'::jsonb) where job_id=new.id::text;
 end if;
 return new;
end; $$;
drop trigger if exists require_jha_before_job_complete on public.jobs;
create trigger require_jha_before_job_complete before insert or update on public.jobs for each row execute function public.require_jha_before_job_complete();

commit;
