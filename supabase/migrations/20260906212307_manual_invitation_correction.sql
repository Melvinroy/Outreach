alter table public.outreach_assist_sessions drop constraint outreach_assist_sessions_skip_reason_check;
alter table public.outreach_assist_sessions add constraint outreach_assist_sessions_skip_reason_check check(skip_reason is null or skip_reason in ('already_pending','already_connected','previously_contacted','owner_verified_not_sent'));
-- Add a per-invitation correction through the existing authenticated command facade.
-- The frozen message and original failure evidence are retained; nothing is sent.
alter function outreach_private.manual_outreach(text,jsonb) rename to manual_outreach_v2;
revoke all on function outreach_private.manual_outreach_v2(text,jsonb) from public,anon,authenticated,service_role;
create function outreach_private.manual_outreach(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.outreach_assist_sessions%rowtype; c public.outreach_contacts%rowtype; note text; remaining integer; failed integer; skipped integer;
begin
 if cmd<>'record_invitation_not_sent' then return outreach_private.manual_outreach_v2(cmd,p);end if;
 perform outreach_private.cc_owner();
 perform pg_advisory_xact_lock(793520602);
 if (select mode from public.outreach_execution_config where singleton)<>'legacy' then raise exception 'Manual corrections unavailable while legacy execution is paused';end if;
 note:=btrim(coalesce(p->>'note',''));
 if p->>'confirmed_not_sent' is distinct from 'true' or length(note)<10 or length(note)>2000 then raise exception 'Confirm that no invitation was sent and describe your LinkedIn check (10–2000 characters)';end if;
 select * into s from public.outreach_assist_sessions where id=(p->>'session_id')::uuid and requested_by=auth.uid() for update;
 if not found or s.status<>'failed' or s.confirmation_signal is not null then raise exception 'Only an unresolved failed invitation without sent confirmation can be corrected';end if;
 select * into c from public.outreach_contacts where id=s.contact_id for update;
 if c.connection_status<>'not_contacted' then raise exception 'Contact has a recorded relationship; refresh before correcting';end if;
 if exists(select 1 from public.outreach_jobs where contact_id=c.id and state in ('claimed','checking','sending','uncertain'))
 or exists(select 1 from public.outreach_assist_sessions where contact_id=c.id and id<>s.id and status in ('prepared','failed'))
 or exists(select 1 from public.outreach_phase5_sessions where contact_id=c.id and status in ('prepared','failed')) then raise exception 'Other active or unresolved work must be checked first';end if;
 update public.outreach_assist_sessions set status='skipped',skip_reason='owner_verified_not_sent',
 preflight_evidence=concat_ws(E'\n',preflight_evidence,'Manual correction by '||auth.uid()||' at '||now()||': '||note),preflight_checked_at=now(),updated_at=now() where id=s.id;
 if s.batch_id is not null then
  select count(*) filter(where status='prepared'),count(*) filter(where status='failed'),count(*) filter(where status='skipped') into remaining,failed,skipped from public.outreach_assist_sessions where batch_id=s.batch_id;
  update public.outreach_assist_batches set status=case when remaining>0 then status when failed>0 or skipped>0 then 'partially_completed' else 'completed' end,
  completed_at=case when remaining=0 then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=s.batch_id and requested_by=auth.uid();
 end if;
 return jsonb_build_object('message','Recorded as not sent. Review identity and the saved invitation in To connect. Nothing queued or sent.');
end $$;
revoke all on function outreach_private.manual_outreach(text,jsonb) from public,anon;
grant execute on function outreach_private.manual_outreach(text,jsonb) to authenticated,service_role;
create or replace function public.manual_outreach(p_command text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select outreach_private.manual_outreach(p_command,p_payload)$$;
notify pgrst,'reload schema';
