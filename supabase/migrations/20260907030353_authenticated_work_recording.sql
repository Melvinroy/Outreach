-- Owner-authenticated Work recording. No SQL/admin tool is exposed through MCP.
create table outreach_private.work_clients(owner_id uuid references auth.users(id),client_id uuid,enabled boolean not null default true,last_seen_at timestamptz,primary key(owner_id,client_id));
create table outreach_private.work_claims(batch_id uuid primary key references public.outreach_assist_batches(id),owner_id uuid not null references auth.users(id),execution_id uuid not null,client_id uuid,claimed_at timestamptz not null default now());
create table outreach_private.work_attempts(session_id uuid primary key references public.outreach_assist_sessions(id),owner_id uuid not null references auth.users(id),execution_id uuid not null,operation_id uuid not null,started_at timestamptz not null default now(),receipt jsonb,unique(owner_id,operation_id));
create table outreach_private.work_receipts(owner_id uuid not null references auth.users(id),operation_id uuid not null,payload_hash text not null,receipt jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,operation_id));
create table outreach_private.work_recovery(session_id uuid primary key references public.outreach_assist_sessions(id),owner_id uuid not null references auth.users(id),reason text not null,created_at timestamptz not null default now(),resolved_at timestamptz);
do $$ declare t text;begin foreach t in array array['work_clients','work_claims','work_attempts','work_receipts','work_recovery'] loop execute format('alter table outreach_private.%I enable row level security',t);execute format('revoke all on outreach_private.%I from public,anon,authenticated,service_role',t);end loop;end $$;
alter table public.outreach_assist_sessions add column recorded_at timestamptz, add column recovered boolean not null default false;
alter table public.outreach_assist_sessions drop constraint outreach_assist_sessions_skip_reason_check;
alter table public.outreach_assist_sessions add constraint outreach_assist_sessions_skip_reason_check check(skip_reason is null or skip_reason in ('already_pending','already_connected','previously_contacted','owner_verified_not_sent','connect_unavailable','email_required'));

create function outreach_private.work_owner() returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=outreach_private.cc_owner(); cid text:=nullif(coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id',''),'');begin
 if cid is not null and not exists(select 1 from outreach_private.work_clients where owner_id=u and client_id=cid::uuid and enabled) then raise exception 'Reconnect Outreach Work and approve access' using errcode='42501';end if;
 return u;
end $$;
revoke all on function outreach_private.work_owner() from public,anon,authenticated,service_role;

-- Hold the specifically reported batch; this is a recording incident, not permission to send.
insert into outreach_private.work_recovery(session_id,owner_id,reason)
select s.id,s.requested_by,'Work reported this batch processed, but recording failed. Verify LinkedIn without sending again.' from public.outreach_assist_sessions s join public.outreach_assist_batches b on b.id=s.batch_id where upper(substr(replace(b.id::text,'-',''),1,8))='4CA66603' and s.status='prepared';

create function outreach_private.work_start_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='running' and (old.status is distinct from new.status or old.started_at is null) and exists(
 select 1 from outreach_private.work_recovery where owner_id=new.requested_by and resolved_at is null
 union all select 1 from outreach_private.work_attempts where owner_id=new.requested_by and receipt is null) then raise exception 'Verify the unrecorded LinkedIn outcome before starting outreach';end if;
 return new;
end $$;
revoke all on function outreach_private.work_start_guard() from public,anon,authenticated,service_role;
create trigger work_start_guard before update on public.outreach_assist_batches for each row execute function outreach_private.work_start_guard();

-- Pending attempts/recovery holds also block start/resume and automatic queue fill.
do $$ declare d text;begin
 d:=pg_get_functiondef('outreach_private.rolling_queue_state()'::regprocedure);
 d:=replace(d,'outreach_private.invitation_uncertain(s)) uncertain','(outreach_private.invitation_uncertain(s) or exists(select 1 from outreach_private.work_recovery h where h.session_id=s.id and h.resolved_at is null) or exists(select 1 from outreach_private.work_attempts a where a.session_id=s.id and a.receipt is null))) uncertain');
 execute d;
end $$;

create function outreach_private.work_recording(cmd text,p jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=outreach_private.work_owner(); cid text:=nullif(coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id',''),'');
 b public.outreach_assist_batches%rowtype;s public.outreach_assist_sessions%rowtype;cl outreach_private.work_claims%rowtype;a outreach_private.work_attempts%rowtype;r outreach_private.work_receipts%rowtype;
 bid uuid;sid uuid;eid uuid;op uuid; result jsonb;hash text;outcome text;note text;observed timestamptz;is_recovery boolean;active integer;bad integer;stamp timestamptz:=now();
begin
 if cmd in ('allow_client','revoke_client') then
  if cid is not null then raise exception 'Use your signed-in Outreach account to manage access';end if;
  insert into outreach_private.work_clients(owner_id,client_id,enabled) values(u,(p->>'client_id')::uuid,cmd='allow_client') on conflict(owner_id,client_id) do update set enabled=excluded.enabled;
  return jsonb_build_object('enabled',cmd='allow_client');
 end if;
 if cmd='status' then return jsonb_build_object('clients',(select coalesce(jsonb_agg(jsonb_build_object('client_id',client_id,'enabled',enabled,'last_seen_at',last_seen_at)),'[]') from outreach_private.work_clients where owner_id=u));end if;
 if cid is not null then update outreach_private.work_clients set last_seen_at=stamp where owner_id=u and client_id=cid::uuid;end if;
 if cmd='receipt' then return (select receipt from outreach_private.work_receipts where owner_id=u and operation_id=(p->>'operation_id')::uuid);end if;
 perform pg_advisory_xact_lock(793520602);
 if p ? 'batch_code' then
  select * into b from public.outreach_assist_batches where requested_by=u and upper(substr(replace(id::text,'-',''),1,8))=upper(p->>'batch_code') for update;
 else
  sid:=(p->>'session_id')::uuid;select * into s from public.outreach_assist_sessions where id=sid and requested_by=u for update;
  select * into b from public.outreach_assist_batches where id=s.batch_id and requested_by=u for update;
 end if;
 if b.id is null then raise exception 'Queue not found or access denied' using errcode='42501';end if;bid:=b.id;
 if cmd='inspect' then return jsonb_build_object('batch_id',bid,'status',b.status,'queue_number',b.queue_number,'recovery_required',exists(select 1 from outreach_private.work_recovery h join public.outreach_assist_sessions x on x.id=h.session_id where x.batch_id=bid and h.resolved_at is null),'sessions',(select coalesce(jsonb_agg(jsonb_build_object('session_id',x.id,'name',c.full_name,'employer',c.employer,'profile_url',x.profile_url_snapshot,'message',x.message_snapshot,'status',x.status,'attempt_pending',exists(select 1 from outreach_private.work_attempts where session_id=x.id and receipt is null)) order by x.sequence_no),'[]') from public.outreach_assist_sessions x join public.outreach_contacts c on c.id=x.contact_id where x.batch_id=bid));end if;
 op:=(p->>'operation_id')::uuid;if op is null then raise exception 'Operation ID required';end if;hash:=md5((p-'operation_id')::text||cmd);
 select * into r from outreach_private.work_receipts where owner_id=u and operation_id=op;
 if found then if r.payload_hash<>hash then raise exception 'Operation ID already used for different data';end if;return r.receipt;end if;
 eid:=(p->>'execution_id')::uuid;
 select * into cl from outreach_private.work_claims where batch_id=bid;
 if cmd='claim' then
  if eid is null then raise exception 'Execution ID required';end if;
  if cl.batch_id is not null and (cl.execution_id<>eid or cl.client_id is distinct from cid::uuid) then raise exception 'Queue belongs to another execution. Resume that execution; do not resend.';end if;
  perform public.start_browser_assisted_batch(bid);
  insert into outreach_private.work_claims(batch_id,owner_id,execution_id,client_id) values(bid,u,eid,cid::uuid) on conflict(batch_id) do nothing;
  result:=jsonb_build_object('batch_id',bid,'execution_id',eid,'claimed',true);
 elsif cmd='begin' then
  if cl.batch_id is null or cl.execution_id is distinct from eid or cl.client_id is distinct from cid::uuid or b.status<>'running' then raise exception 'Claim this queue before beginning outreach';end if;
  if exists(select 1 from outreach_private.work_recovery where owner_id=u and resolved_at is null) or exists(select 1 from outreach_private.work_attempts where owner_id=u and receipt is null) then raise exception 'Verify the pending outcome before beginning another attempt';end if;
  if s.status<>'prepared' or exists(select 1 from public.outreach_contacts where id=s.contact_id and connection_status<>'not_contacted') then raise exception 'Recipient is no longer eligible';end if;
  insert into outreach_private.work_attempts(session_id,owner_id,execution_id,operation_id) values(sid,u,eid,op);
  result:=jsonb_build_object('session_id',sid,'execution_id',eid,'attempt_id',op,'begun',true);
 elsif cmd in ('record','recover') then
  is_recovery:=cmd='recover';select * into a from outreach_private.work_attempts where session_id=sid for update;
  if not is_recovery and (cl.batch_id is null or cl.execution_id is distinct from eid or cl.client_id is distinct from cid::uuid or a.session_id is null or a.execution_id<>eid) then raise exception 'A claimed execution and persisted attempt are required';end if;
  if is_recovery and not exists(select 1 from outreach_private.work_recovery where session_id=sid and resolved_at is null) and not exists(select 1 from outreach_private.work_attempts where session_id=sid and receipt is null) then raise exception 'No unresolved attempt to recover';end if;
  if s.status not in ('prepared','failed') or s.confirmation_signal is not null then raise exception 'Outcome is already recorded; inspect its receipt';end if;
  outcome:=p->>'outcome';note:=btrim(p->>'evidence');observed:=(p->>'observed_at')::timestamptz;
  if note is null or length(note)<10 or length(note)>2000 or observed is null or observed>stamp+interval '5 minutes' then raise exception 'Visible evidence and a valid observation time are required';end if;
  if outcome not in ('sent','already_pending','already_connected','connect_unavailable','email_required','identity_mismatch','uncertain','verified_not_sent') then raise exception 'Unsupported outcome';end if;
  if outcome='sent' and p->>'confirmation_signal' is distinct from 'linkedin_invitation_sent_visible' then raise exception 'Visible invitation confirmation required';end if;
  if outcome='sent' then
   update public.outreach_contacts set connection_status=case when connection_status='connected' then connection_status else 'request_sent' end,updated_at=stamp where id=s.contact_id;
   insert into public.outreach_activities(contact_id,activity_type,activity_at,note,evidence_source,recorded_by) values(s.contact_id,'request_sent',observed,case when is_recovery then 'Recovered from visible LinkedIn evidence; exact send time unavailable. ' else 'Work confirmed visible invitation success. ' end||note,'browser_assisted',u);
  elsif outcome in ('already_pending','already_connected') then
   update public.outreach_contacts set connection_status=case when connection_status='connected' or outcome='already_connected' then 'connected' else 'request_sent' end,updated_at=stamp where id=s.contact_id;
  end if;
  update public.outreach_assist_sessions set status=case when outcome='sent' then 'completed' when outcome in ('identity_mismatch','uncertain') then 'failed' else 'skipped' end,
   confirmation_signal=case when outcome='sent' then 'linkedin_invitation_sent_visible' else null end,
   skip_reason=case when outcome in ('already_pending','already_connected','connect_unavailable','email_required') then outcome when outcome='verified_not_sent' then 'owner_verified_not_sent' else null end,
   failure_reason=case when outcome='identity_mismatch' then 'pre-send identity mismatch: '||note when outcome='uncertain' then 'Uncertain delivery: '||note else null end,
   preflight_evidence=left(note,500),preflight_checked_at=observed,completed_at=observed,recorded_at=stamp,recovered=is_recovery,updated_at=stamp where id=sid;
  result:=jsonb_build_object('session_id',sid,'outcome',outcome,'recorded_at',stamp,'observed_at',observed,'recovered',is_recovery,'operation_id',op);
  update outreach_private.work_attempts set receipt=result where session_id=sid;
  update outreach_private.work_recovery set resolved_at=stamp where session_id=sid;
  select count(*) filter(where status='prepared'),count(*) filter(where status in ('failed','skipped')) into active,bad from public.outreach_assist_sessions where batch_id=bid;
  update public.outreach_assist_batches set status=case when active>0 then case when started_at is null then 'ready' else 'running' end when bad>0 then 'partially_completed' else 'completed' end,completed_at=case when active=0 then stamp else null end,updated_at=stamp where id=bid;
 else raise exception 'Unsupported Work command';end if;
 insert into outreach_private.work_receipts(owner_id,operation_id,payload_hash,receipt) values(u,op,hash,result);
 return result;
end $$;
revoke all on function outreach_private.work_recording(text,jsonb) from public,anon;
grant execute on function outreach_private.work_recording(text,jsonb) to authenticated;
create function public.work_recording(cmd text,p jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select outreach_private.work_recording(cmd,p)$$;
revoke all on function public.work_recording(text,jsonb) from public,anon;
grant execute on function public.work_recording(text,jsonb) to authenticated;

