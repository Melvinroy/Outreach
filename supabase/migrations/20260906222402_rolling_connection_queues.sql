-- Rolling invitation queues: four unfinished logical queues, fifteen people each.
alter table public.outreach_assist_batches add column queue_number bigint;
with numbered as (select id,row_number() over(partition by requested_by order by created_at,id) n from public.outreach_assist_batches)
update public.outreach_assist_batches b set queue_number=n.n from numbered n where n.id=b.id;
alter table public.outreach_assist_batches alter column queue_number set not null;
drop index public.outreach_assist_batches_one_active_idx;
-- Retire existing empty shells before installing the execution constraint.
update public.outreach_assist_batches b set status='completed',completed_at=coalesce(completed_at,now()) where status in ('ready','running','awaiting_confirmation') and not exists(select 1 from public.outreach_assist_sessions x where x.batch_id=b.id and (x.status='prepared' or x.status='failed' or (x.status='completed' and x.confirmation_signal is null)));
create unique index outreach_assist_batches_one_running_idx on public.outreach_assist_batches(requested_by) where status in ('running','awaiting_confirmation');
create table outreach_private.queue_save_receipts(requested_by uuid not null references auth.users(id),request_id uuid not null,payload_hash text not null,receipt jsonb not null,created_at timestamptz not null default now(),primary key(requested_by,request_id));
alter table outreach_private.queue_save_receipts enable row level security;
revoke all on outreach_private.queue_save_receipts from public,anon,authenticated,service_role;

create function outreach_private.invitation_uncertain(s public.outreach_assist_sessions) returns boolean language sql immutable set search_path='' as $$
 select (s.status='completed' and s.confirmation_signal is null) or (s.status='failed' and not (coalesce(s.failure_reason,'') ~* '^(LinkedIn identity mismatch: prepared employer .+; live profile shows .+|pre-send identity mismatch)' and s.confirmation_signal is null))
$$;
revoke all on function outreach_private.invitation_uncertain(public.outreach_assist_sessions) from public,anon,authenticated,service_role;
create function outreach_private.rolling_queue_state() returns jsonb language sql stable security definer set search_path='' as $$
 with q as (
 select b.*, (select count(*) from public.outreach_assist_sessions s where s.batch_id=b.id and s.status='prepared') remaining,
 exists(select 1 from public.outreach_assist_sessions s where s.batch_id=b.id and outreach_private.invitation_uncertain(s)) uncertain
 from public.outreach_assist_batches b where b.requested_by=auth.uid() and b.status<>'cancelled'
 ), active as(select * from q where remaining>0 or uncertain), packed as (
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',queue_number,'status',status,'remaining',remaining,'started',started_at is not null or status<>'ready','uncertain',uncertain) order by queue_number,id),'[]') queues,
 count(*) active_count,coalesce(sum(case when status='ready' and started_at is null and not uncertain then 15-remaining else 0 end),0) room from active
 ) select jsonb_build_object('queues',queues,'capacity',room+greatest(0,4-active_count)*15,'next_number',coalesce((select max(queue_number)+1 from public.outreach_assist_batches where requested_by=auth.uid()),1),'token',md5(jsonb_build_object('fillable',(select coalesce(jsonb_agg(q order by (q->>'number')::bigint),'[]') from jsonb_array_elements(queues) q where not (q->>'started')::boolean and not (q->>'uncertain')::boolean),'capacity',room+greatest(0,4-active_count)*15,'next_number',coalesce((select max(queue_number)+1 from public.outreach_assist_batches where requested_by=auth.uid()),1))::text)) from packed
$$;
revoke all on function outreach_private.rolling_queue_state() from public,anon,authenticated,service_role;
create function outreach_private.rolling_allocation(n integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare state jsonb:=outreach_private.rolling_queue_state(); q jsonb; allocations jsonb:='[]'; left_count integer:=n; take_count integer; next_no bigint:=(state->>'next_number')::bigint;
begin
 if n<1 or n>60 then raise exception 'Select between 1 and 60 people';end if;
 if n>(state->>'capacity')::integer then raise exception 'Only % spaces remain across four queues; your selection was not saved',state->>'capacity';end if;
 for q in select value from jsonb_array_elements(state->'queues') loop
  if not (q->>'started')::boolean and not (q->>'uncertain')::boolean then
   take_count:=least(left_count,15-(q->>'remaining')::integer);
   if take_count>0 then allocations:=allocations||jsonb_build_array(jsonb_build_object('batch_id',q->>'id','number',q->'number','count',take_count));left_count:=left_count-take_count;end if;
  end if;
 end loop;
 while left_count>0 loop
  take_count:=least(left_count,15);allocations:=allocations||jsonb_build_array(jsonb_build_object('number',next_no,'count',take_count));next_no:=next_no+1;left_count:=left_count-take_count;
 end loop;
 return state||jsonb_build_object('allocations',allocations);
end $$;
revoke all on function outreach_private.rolling_allocation(integer) from public,anon,authenticated,service_role;

-- Remove the workspace-wide save block, retaining every person/draft check.
do $$ declare d text; old text; begin
 d:=replace(pg_get_functiondef('outreach_private.manual_invitation(uuid)'::regprocedure),E'\r','');
 old:=$find$ if d->>'blocked_reason' is null and exists(select 1 from public.outreach_assist_batches where requested_by=auth.uid() and status in ('ready','running','awaiting_confirmation')) then d:=d||'{"blocked_reason":"An unfinished connection batch already exists. Continue or reconcile it before queuing another."}';end if;$find$;
 old:=replace(old,E'\r','');
 if strpos(d,old)=0 then raise exception 'Invitation save guard source changed';end if;
 execute replace(d,old,'');
 d:=replace(pg_get_functiondef('public.prepare_browser_assisted_batch(bigint[])'::regprocedure),E'\r','');
 old:=$find$  if exists(select 1 from public.outreach_assist_batches b where b.requested_by=v_user_id and b.status in ('ready','running','awaiting_confirmation')) then
    raise exception 'An unfinished connection batch already exists. Continue or reconcile it before creating another.';
  end if;$find$;
 old:=replace(old,E'\r','');
 if strpos(d,old)=0 then raise exception 'Legacy queue guard source changed';end if;
 execute replace(d,old,'');
 -- Existing draft replacement copies all batch columns, including logical number.
 d:=replace(pg_get_functiondef('outreach_private.manual_outreach_v2(text,jsonb)'::regprocedure),E'\r','');
 old:=$find$  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1)',tbl,tbl) using b;$find$;
 old:=replace(old,E'\r','');
 if strpos(d,old)=0 then raise exception 'Draft replacement source changed';end if;
 execute replace(d,old,$new$  if kind='invitation' then perform set_config('outreach.queue_replacement',old_id::text,true);end if;
$new$||old||$new$
  perform set_config('outreach.queue_replacement','',true);$new$);
end $$;

create function outreach_private.rolling_batch_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare state jsonb; root public.outreach_assist_batches%rowtype; first_id uuid;
begin
 perform outreach_private.cc_owner();perform pg_advisory_xact_lock(793520602);
 if new.requested_by<>auth.uid() then raise exception 'Queue ownership mismatch';end if;
 state:=outreach_private.rolling_queue_state();
 if tg_op='INSERT' then
  if jsonb_array_length(state->'queues')>=4 then raise exception 'Four queues are already unfinished';end if;
  if new.queue_number is null then new.queue_number:=(state->>'next_number')::bigint;
  else
   select * into root from public.outreach_assist_batches where id=nullif(current_setting('outreach.queue_replacement',true),'')::uuid and requested_by=auth.uid() and status='cancelled';
   if not found or root.queue_number<>new.queue_number or root.started_at is not null then raise exception 'Queue order cannot be changed';end if;
  end if;
 elsif new.queue_number<>old.queue_number or new.requested_by<>old.requested_by then raise exception 'Queue identity is immutable';
 end if;
 if new.status='running' and (tg_op='INSERT' or old.status is distinct from new.status) then
  if exists(select 1 from jsonb_array_elements(state->'queues') q where (q->>'uncertain')::boolean) then raise exception 'Check uncertain delivery before starting another queue';end if;
  select (q->>'id')::uuid into first_id from jsonb_array_elements(state->'queues') q order by (q->>'number')::bigint limit 1;
  if first_id is distinct from new.id then raise exception 'Run the oldest saved queue first';end if;
 end if;
 return new;
end $$;
revoke all on function outreach_private.rolling_batch_guard() from public,anon,authenticated,service_role;
create trigger rolling_batch_guard before insert or update on public.outreach_assist_batches for each row execute function outreach_private.rolling_batch_guard();
create function outreach_private.rolling_recipient_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(793520602);
 if new.status='prepared' and (select count(*) from public.outreach_assist_sessions s where s.batch_id=new.batch_id and s.id<>new.id and s.status<>'cancelled')>=15 then raise exception 'A connection queue holds at most 15 people';end if;
 if new.status='prepared' and exists(select 1 from public.outreach_assist_sessions s where s.contact_id=new.contact_id and s.id<>new.id and s.status='prepared') then raise exception 'Person is already in an unfinished invitation queue';end if;
 return new;
end $$;
revoke all on function outreach_private.rolling_recipient_guard() from public,anon,authenticated,service_role;
create trigger rolling_recipient_guard before insert or update on public.outreach_assist_sessions for each row execute function outreach_private.rolling_recipient_guard();

alter function outreach_private.manual_outreach(text,jsonb) rename to manual_outreach_v3;
revoke all on function outreach_private.manual_outreach_v3(text,jsonb) from public,anon,authenticated,service_role;
create function outreach_private.manual_outreach(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; state jsonb; plan jsonb; allocation jsonb; item jsonb; d jsonb; bodies jsonb; old_batch public.outreach_assist_batches%rowtype;
 validated_drafts jsonb:='{}';new_batch public.outreach_assist_batches%rowtype; session public.outreach_assist_sessions%rowtype; receipt jsonb; fingerprint text; old_hash text;
 request uuid; cursor_count integer:=0; seq integer; n integer; receipt_batches jsonb:='[]'; first_id uuid; stopped boolean;
begin
 perform outreach_private.cc_owner();
 if cmd in ('queue','queue_preview','queue_receipt') then
  perform pg_advisory_xact_lock(793520602);
  if (select mode from public.outreach_execution_config where singleton)<>'legacy' then raise exception 'Connection queuing is paused';end if;
 end if;
 if cmd='queue_receipt' then
  select r.receipt into receipt from outreach_private.queue_save_receipts r where r.requested_by=auth.uid() and r.request_id=(p->>'request_id')::uuid;
  return jsonb_build_object('receipt',receipt);
 elsif cmd='queue_preview' then return outreach_private.rolling_allocation(jsonb_array_length(p->'items'));
 elsif cmd='queue' then
  if jsonb_typeof(p->'items') is distinct from 'array' then raise exception 'Select people before saving';end if;
  n:=jsonb_array_length(p->'items');request:=coalesce((p->>'request_id')::uuid,gen_random_uuid());fingerprint:=md5((p->'items')::text);
  select r.receipt,r.payload_hash into receipt,old_hash from outreach_private.queue_save_receipts r where r.requested_by=auth.uid() and r.request_id=request;
  if found then if old_hash<>fingerprint then raise exception 'Save request reused with different people';end if;return receipt;end if;
  plan:=outreach_private.rolling_allocation(n);
  if p ? 'allocation_token' and p->>'allocation_token' is distinct from plan->>'token' then return jsonb_build_object('allocation_changed',true,'plan',plan);end if;
  if (select count(distinct value->>'contact_id') from jsonb_array_elements(p->'items'))<>n then raise exception 'Select each person once';end if;
  for item in select value from jsonb_array_elements(p->'items') loop
   perform 1 from public.outreach_contacts where id=(item->>'contact_id')::uuid for update;
   perform 1 from public.outreach_recommendations where contact_id=(item->>'contact_id')::uuid for update;
   perform 1 from public.outreach_actions where contact_id=(item->>'contact_id')::uuid for update;
   if not exists(select 1 from public.outreach_contacts where id=(item->>'contact_id')::uuid and connection_status='not_contacted' and linkedin_profile_url ~ '^https?://') then raise exception 'Person is no longer eligible for a connection invitation';end if;
   d:=outreach_private.manual_invitation((item->>'contact_id')::uuid);
   if d is null or d->>'token' is distinct from item->>'token' or d->>'text' is distinct from item->>'text' then raise exception 'Invitation changed. Refresh and review the saved draft';end if;
   if d->>'blocked_reason' is not null then raise exception '%',d->>'blocked_reason';end if;
   if exists(select 1 from public.outreach_assist_sessions where contact_id=(item->>'contact_id')::uuid and status='prepared') then raise exception 'Person is already queued';end if;
   validated_drafts:=validated_drafts||jsonb_build_object(item->>'contact_id',d);
  end loop;
  for allocation in select value from jsonb_array_elements(plan->'allocations') loop
   bodies:='[]';seq:=0;
   if allocation ? 'batch_id' then
    select * into old_batch from public.outreach_assist_batches where id=(allocation->>'batch_id')::uuid for update;
    if old_batch.status<>'ready' or old_batch.started_at is not null then raise exception 'Queue has started; review the new allocation';end if;
    for session in select * from public.outreach_assist_sessions where batch_id=old_batch.id and status='prepared' order by sequence_no loop
     perform 1 from public.outreach_contacts where id=session.contact_id for update;
     if exists(select 1 from public.outreach_activities where contact_id=session.contact_id and activity_type in ('request_sent','connected','message_sent','follow_up','reply_received','meeting_scheduled','referral')) then raise exception 'An existing queued recipient has new relationship evidence';end if;
     if outreach_private.manual_contact_block(session.contact_id) is not null or (select connection_status from public.outreach_contacts where id=session.contact_id)<>'not_contacted' or (select linkedin_profile_url from public.outreach_contacts where id=session.contact_id) is distinct from session.profile_url_snapshot then raise exception 'An existing queued recipient needs review before adding people';end if;
     bodies:=bodies||jsonb_build_array(to_jsonb(session));
    end loop;
    update public.outreach_assist_sessions set status='cancelled',updated_at=now() where batch_id=old_batch.id and status='prepared';
    update public.outreach_assist_batches set status='cancelled',completed_at=now(),updated_at=now() where id=old_batch.id;
    perform set_config('outreach.queue_replacement',old_batch.id::text,true);
   end if;
   insert into public.outreach_assist_batches(requested_by,selected_count,queue_number) values(auth.uid(),jsonb_array_length(bodies)+(allocation->>'count')::integer,case when allocation ? 'batch_id' then old_batch.queue_number else null end) returning * into new_batch;
   perform set_config('outreach.queue_replacement','',true);
   for item in select value from jsonb_array_elements(bodies) loop
    seq:=seq+1;
    insert into public.outreach_assist_sessions(batch_id,sequence_no,contact_id,recommendation_id,requested_by,profile_url_snapshot,message_snapshot)
    values(new_batch.id,seq,(item->>'contact_id')::uuid,(item->>'recommendation_id')::bigint,auth.uid(),item->>'profile_url_snapshot',item->>'message_snapshot');
   end loop;
   for item in select value from jsonb_array_elements(p->'items') with ordinality v(value,ord) where ord>cursor_count and ord<=cursor_count+(allocation->>'count')::integer order by ord loop
    d:=validated_drafts->(item->>'contact_id');seq:=seq+1;
    insert into public.outreach_assist_sessions(batch_id,sequence_no,contact_id,recommendation_id,requested_by,profile_url_snapshot,message_snapshot)
    select new_batch.id,seq,c.id,(d->>'recommendation_id')::bigint,auth.uid(),c.linkedin_profile_url,item->>'text' from public.outreach_contacts c where c.id=(item->>'contact_id')::uuid;
   end loop;
   if allocation ? 'batch_id' then insert into outreach_private.batch_replacements(old_batch_id,new_batch_id,kind,changed_contact_id,changed_by) values(old_batch.id,new_batch.id,'invitation',(p->'items'->cursor_count->>'contact_id')::uuid,auth.uid());end if;
   cursor_count:=cursor_count+(allocation->>'count')::integer;
   receipt_batches:=receipt_batches||jsonb_build_array(jsonb_build_object('batch_id',new_batch.id,'batch_code',upper(substr(replace(new_batch.id::text,'-',''),1,8)),'queue_number',new_batch.queue_number,'added_count',allocation->'count','selected_count',new_batch.selected_count));
  end loop;
  receipt:=jsonb_build_object('request_id',request,'selected_count',n,'batches',receipt_batches,'batch_id',receipt_batches->0->'batch_id','batch_code',receipt_batches->0->'batch_code');
  insert into outreach_private.queue_save_receipts values(auth.uid(),request,fingerprint,receipt,now());return receipt;
 elsif cmd='snapshot' then
  result:=outreach_private.manual_outreach_v3(cmd,p);state:=outreach_private.rolling_queue_state();
  select (q->>'id')::uuid into first_id from jsonb_array_elements(state->'queues') q order by (q->>'number')::bigint limit 1;
  stopped:=exists(select 1 from jsonb_array_elements(state->'queues') q where (q->>'uncertain')::boolean);
  result:=jsonb_set(result,'{batches}',coalesce((select jsonb_agg(b.value||case when b.value->>'kind'='invitation' then jsonb_build_object('queue_number',a.queue_number,'can_run',a.id=first_id and not stopped and a.status in ('ready','running'),'run_block_reason',case when stopped then 'Check uncertain delivery before continuing' when a.id<>first_id then 'Waiting for earlier queue' end) else '{}'::jsonb end) from jsonb_array_elements(result->'batches') b left join public.outreach_assist_batches a on a.id=(b.value->>'id')::uuid),'[]'));
  return result||jsonb_build_object('queue_owner',auth.uid(),'queue_state',state,'queue_updated_at',clock_timestamp());
 end if;
 return outreach_private.manual_outreach_v3(cmd,p);
end $$;
revoke all on function outreach_private.manual_outreach(text,jsonb) from public,anon;
grant execute on function outreach_private.manual_outreach(text,jsonb) to authenticated,service_role;
create or replace function public.manual_outreach(p_command text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select outreach_private.manual_outreach(p_command,p_payload)$$;
-- No-code lookup must resume the running queue, otherwise choose the oldest saved one.
do $$ declare d text; begin
 d:=replace(pg_get_functiondef('public.get_browser_assisted_batch(text)'::regprocedure),E'\r','');
 if strpos(d,'order by b.created_at desc')=0 then raise exception 'Batch lookup source changed';end if;
 execute replace(d,'order by b.created_at desc',$order$order by (b.status='running') desc,b.queue_number,b.id$order$);
end $$;
notify pgrst,'reload schema';

create function outreach_private.rolling_finish_empty() returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid:=coalesce(new.batch_id,old.batch_id);begin
 perform pg_advisory_xact_lock(793520602);
 if bid is not null and not exists(select 1 from public.outreach_assist_sessions s where s.batch_id=bid and (s.status='prepared' or outreach_private.invitation_uncertain(s))) then
  update public.outreach_assist_batches b set status=case when exists(select 1 from public.outreach_assist_sessions s where s.batch_id=bid and s.status in ('failed','skipped')) then 'partially_completed' when exists(select 1 from public.outreach_assist_sessions s where s.batch_id=bid and s.status='completed') then 'completed' else 'cancelled' end,completed_at=coalesce(completed_at,now()),updated_at=now() where id=bid and status in ('ready','running','awaiting_confirmation');
 end if;
 return null;
end $$;
revoke all on function outreach_private.rolling_finish_empty() from public,anon,authenticated,service_role;
create trigger rolling_finish_empty after update of status or delete on public.outreach_assist_sessions for each row execute function outreach_private.rolling_finish_empty();
create function outreach_private.start_rolling_batch(p_batch_id uuid) returns table(batch_id uuid,status text,started_at timestamptz) language plpgsql security definer set search_path='' as $$
declare state jsonb; first_id uuid; b public.outreach_assist_batches%rowtype;begin
 perform outreach_private.cc_owner();perform pg_advisory_xact_lock(793520602);
 if (select mode from public.outreach_execution_config where singleton)<>'legacy' then raise exception 'Legacy execution is paused';end if;
 state:=outreach_private.rolling_queue_state();
 if exists(select 1 from jsonb_array_elements(state->'queues') q where (q->>'uncertain')::boolean) then raise exception 'Check uncertain delivery before starting or resuming outreach';end if;
 select (q->>'id')::uuid into first_id from jsonb_array_elements(state->'queues') q order by (q->>'number')::bigint limit 1;
 if first_id is distinct from p_batch_id then raise exception 'Run the oldest saved queue first';end if;
 select * into b from public.outreach_assist_batches where id=p_batch_id and requested_by=auth.uid() for update;
 if not found or b.status not in ('ready','running') then raise exception 'This queue is no longer runnable';end if;
 update public.outreach_assist_batches x set status='running',started_at=coalesce(x.started_at,now()),updated_at=now() where x.id=p_batch_id;
 return query select x.id,x.status,x.started_at from public.outreach_assist_batches x where x.id=p_batch_id;
end $$;
revoke all on function outreach_private.start_rolling_batch(uuid) from public,anon;
grant execute on function outreach_private.start_rolling_batch(uuid) to authenticated,service_role;
create or replace function public.start_browser_assisted_batch(p_batch_id uuid) returns table(batch_id uuid,status text,started_at timestamptz) language sql security invoker set search_path='' as $$select * from outreach_private.start_rolling_batch(p_batch_id)$$;
