-- Recognize explicit no-hazard responses without changing stored assessments,
-- PPE requirements, completion gates, revision history, or staff permissions.
create or replace function public.jha_has_work_hold(reason text) returns boolean
language sql immutable set search_path=public as $$
 select trim(regexp_replace(regexp_replace(lower(trim(coalesce(reason,''))),
   '[[:space:]]+', ' ', 'g'), '[.!]+$', ''))
   not in ('','safe','none','n/a','na','no hazards','no unresolved hazards','no issues','not applicable');
$$;
revoke all on function public.jha_has_work_hold(text) from public, anon, authenticated;
grant execute on function public.jha_has_work_hold(text) to service_role;

create or replace function public.jha_valid_complete(a jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare item jsonb;
begin
 if coalesce(length(trim(a->>'technician')),0)=0 or a->'glasses' is distinct from 'true'::jsonb
 or a->'hearing' is distinct from 'true'::jsonb or a->'acknowledged' is distinct from 'true'::jsonb
 or public.jha_has_work_hold(a->>'unsafeReason') then return false; end if;
 if jsonb_typeof(a->'steps') is distinct from 'array' then return false; end if;
 if jsonb_array_length(a->'steps') not between 1 and 20 then return false; end if;
 for item in select value from jsonb_array_elements(a->'steps') loop
  if coalesce(length(trim(item->>'task')),0)=0 or coalesce(length(trim(item->>'hazards')),0)=0
  or coalesce(length(trim(item->>'controls')),0)=0 or item->'controlled' is distinct from 'true'::jsonb then return false; end if;
 end loop;
 return true;
end; $$;
