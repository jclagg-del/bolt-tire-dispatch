-- Delivery-only jobs do not require a JHA. Preserve the safety gate for
-- installation/service work and preserve all existing assessments/history.
create or replace function public.require_jha_before_job_complete() returns trigger
language plpgsql security definer set search_path=public as $$
declare old_job jsonb; new_job jsonb; jha public.job_jhas; finishing boolean; delivery_only boolean;
begin
 new_job=to_jsonb(new); old_job=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 -- Keep this exact allowlist aligned with isDeliveryService in job-completion.ts.
 -- Do not exempt installation work merely because its description says delivery.
 delivery_only=trim(regexp_replace(lower(coalesce(new_job->>'service_type','')), '[[:space:]]+', ' ', 'g'))
   in ('delivery','delivered','delivery_pickup','delivery / pickup','delivery/pickup','delivery and pickup');
 finishing=(coalesce((new_job->>'complete')::boolean,false) and not coalesce((old_job->>'complete')::boolean,false))
 or (new_job->>'job_status'='completed' and old_job->>'job_status' is distinct from 'completed')
 or (new_job->>'customer_order_status'='Work Completed' and old_job->>'customer_order_status' is distinct from 'Work Completed')
 or (new_job->>'completed_at' is not null and old_job->>'completed_at' is null);
 if finishing and not delivery_only then
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

-- This privileged function is only a trigger, never a browser-callable RPC.
revoke execute on function public.require_jha_before_job_complete() from public, anon, authenticated;
