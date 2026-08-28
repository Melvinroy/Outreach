-- Phase 5: route accepted connections into either an inbound-reply workflow
-- or a delayed proactive follow-up. No message is sent without human review.

create table public.outreach_conversation_events (
  id bigint generated always as identity primary key,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  event_type text not null check (event_type in ('inbound_message', 'conversation_verified')),
  evidence_source text not null check (evidence_source in ('gmail_signal', 'browser_assisted', 'manual')),
  external_evidence_key text,
  message_excerpt text check (message_excerpt is null or char_length(message_excerpt) <= 1000),
  message_body text check (message_body is null or char_length(message_body) <= 5000),
  observed_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index outreach_conversation_events_external_uq
  on public.outreach_conversation_events(evidence_source, external_evidence_key)
  where external_evidence_key is not null;
create index outreach_conversation_events_contact_idx
  on public.outreach_conversation_events(contact_id, observed_at desc);

create table public.outreach_conversation_tasks (
  id bigint generated always as identity primary key,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  recommendation_id bigint references public.outreach_recommendations(id) on delete set null,
  inbound_event_id bigint references public.outreach_conversation_events(id) on delete set null,
  task_type text not null check (task_type in ('proactive_follow_up', 'reply')),
  status text not null check (status in (
    'waiting', 'context_required', 'needs_review', 'approved', 'queued',
    'completed', 'skipped', 'cancelled'
  )),
  due_at timestamptz not null,
  inbound_message text check (inbound_message is null or char_length(inbound_message) <= 5000),
  draft_message text check (draft_message is null or char_length(draft_message) between 1 and 2000),
  source text not null check (source in ('gmail_signal', 'browser_assisted', 'manual', 'system')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  completion_evidence text check (completion_evidence is null or char_length(completion_evidence) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (task_type = 'reply' and inbound_event_id is not null)
    or task_type = 'proactive_follow_up'
  )
);

create unique index outreach_conversation_tasks_one_active_uq
  on public.outreach_conversation_tasks(contact_id, task_type)
  where status in ('waiting', 'context_required', 'needs_review', 'approved', 'queued');
create index outreach_conversation_tasks_due_idx
  on public.outreach_conversation_tasks(status, task_type, due_at);

create table public.outreach_phase5_batches (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('proactive_follow_up', 'reply')),
  selected_count smallint not null check (selected_count between 1 and 15),
  status text not null default 'ready' check (status in (
    'ready', 'running', 'completed', 'partially_completed', 'cancelled', 'failed'
  )),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index outreach_phase5_batches_one_active_uq
  on public.outreach_phase5_batches(requested_by, action_type)
  where status in ('ready', 'running');

create table public.outreach_phase5_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.outreach_phase5_batches(id) on delete cascade,
  task_id bigint not null references public.outreach_conversation_tasks(id) on delete restrict,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  sequence_no smallint not null check (sequence_no between 1 and 15),
  action_type text not null check (action_type in ('proactive_follow_up', 'reply')),
  profile_url_snapshot text not null check (profile_url_snapshot ~ '^https?://'),
  inbound_message_snapshot text,
  message_snapshot text not null,
  status text not null default 'prepared' check (status in ('prepared', 'completed', 'skipped', 'cancelled', 'failed')),
  confirmation_signal text,
  skip_reason text check (skip_reason is null or skip_reason in (
    'already_sent', 'reply_exists', 'not_connected', 'profile_mismatch', 'ambiguous', 'newer_message'
  )),
  evidence text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, sequence_no),
  unique (batch_id, task_id)
);

create index outreach_phase5_sessions_batch_idx
  on public.outreach_phase5_sessions(batch_id, status, sequence_no);

create table public.outreach_phase5_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete cascade,
  workflow_type text not null check (workflow_type in (
    'acceptance_wait', 'inbound_message', 'draft_preparation', 'draft_review',
    'proactive_follow_up_batch', 'reply_batch'
  )),
  thread_id uuid not null default gen_random_uuid(),
  status text not null check (status in ('running', 'waiting_for_user', 'completed', 'partially_completed', 'failed')),
  last_node text not null,
  checkpoint jsonb not null default '{}'::jsonb check (jsonb_typeof(checkpoint) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index outreach_phase5_workflow_runs_owner_idx
  on public.outreach_phase5_workflow_runs(requested_by, started_at desc);

alter table public.outreach_conversation_events enable row level security;
alter table public.outreach_conversation_tasks enable row level security;
alter table public.outreach_phase5_batches enable row level security;
alter table public.outreach_phase5_sessions enable row level security;
alter table public.outreach_phase5_workflow_runs enable row level security;

create policy "Allowlisted users read conversation events"
on public.outreach_conversation_events for select to authenticated
using (exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));
create policy "Allowlisted users read conversation tasks"
on public.outreach_conversation_tasks for select to authenticated
using (exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));
create policy "Owners read phase5 batches"
on public.outreach_phase5_batches for select to authenticated
using (requested_by = (select auth.uid()) and exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));
create policy "Owners read phase5 sessions"
on public.outreach_phase5_sessions for select to authenticated
using (requested_by = (select auth.uid()) and exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));
create policy "Owners read phase5 workflow runs"
on public.outreach_phase5_workflow_runs for select to authenticated
using ((requested_by = (select auth.uid()) or requested_by is null)
  and exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));

revoke all on public.outreach_conversation_events, public.outreach_conversation_tasks,
  public.outreach_phase5_batches, public.outreach_phase5_sessions,
  public.outreach_phase5_workflow_runs from public, anon, authenticated;
grant select on public.outreach_conversation_events, public.outreach_conversation_tasks,
  public.outreach_phase5_batches, public.outreach_phase5_sessions,
  public.outreach_phase5_workflow_runs to authenticated;

create or replace function outreach_private.phase5_follow_up_draft(p_contact_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'Hi ' || split_part(c.full_name, ' ', 1) ||
    ', thanks for connecting. I reached out because ' ||
    left(coalesce(nullif(r.fit_assessment, ''), 'your work at ' || c.employer || ' is closely connected to my background'), 420) ||
    '. I would enjoy learning more about your current priorities and sharing where my experience in fraud, payments, analytics and AI may be useful.'
  from public.outreach_contacts c
  left join lateral (
    select rr.fit_assessment from public.outreach_recommendations rr
    where rr.contact_id = c.id order by rr.verified_at desc, rr.id desc limit 1
  ) r on true
  where c.id = p_contact_id
$$;

create or replace function outreach_private.refresh_outreach_relationship_tasks()
returns table (follow_ups_created integer, withdrawals_created integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_followups integer := 0;
  v_withdrawals integer := 0;
begin
  if v_user_id is not null and not exists (
    select 1 from public.outreach_app_access a where a.user_id = v_user_id
  ) then raise exception 'This account is not approved for outreach'; end if;

  insert into public.outreach_conversation_tasks (
    contact_id, recommendation_id, task_type, status, due_at, draft_message, source
  )
  select c.id, r.id, 'proactive_follow_up', 'needs_review',
    coalesce(a.activity_at, now()) + interval '6 hours',
    outreach_private.phase5_follow_up_draft(c.id),
    case when a.evidence_source = 'gmail_signal' then 'gmail_signal'
      when a.evidence_source in ('browser_assisted', 'manual') then a.evidence_source else 'system' end
  from public.outreach_contacts c
  left join lateral (
    select rr.id from public.outreach_recommendations rr
    where rr.contact_id = c.id order by rr.verified_at desc, rr.id desc limit 1
  ) r on true
  left join lateral (
    select aa.activity_at, aa.evidence_source from public.outreach_activities aa
    where aa.contact_id = c.id and aa.activity_type = 'connected'
    order by aa.activity_at desc limit 1
  ) a on true
  where c.connection_status = 'connected'
    and not exists (
      select 1 from public.outreach_conversation_events e
      where e.contact_id = c.id and e.event_type = 'inbound_message'
        and e.observed_at >= coalesce(a.activity_at, '-infinity'::timestamptz)
    )
    and not exists (
      select 1 from public.outreach_activities sent
      where sent.contact_id = c.id and sent.activity_type in ('message_sent', 'follow_up')
        and sent.activity_at >= coalesce(a.activity_at, '-infinity'::timestamptz)
    )
    and not exists (
      select 1 from public.outreach_conversation_tasks t
      where t.contact_id = c.id and t.task_type = 'proactive_follow_up'
        and t.status in ('waiting', 'context_required', 'needs_review', 'approved', 'queued', 'completed')
    );
  get diagnostics v_followups = row_count;

  insert into public.outreach_relationship_tasks (
    contact_id, recommendation_id, task_type, status, due_at, source
  )
  select c.id, r.id, 'withdraw_invitation', 'due', a.activity_at + interval '14 days', 'system'
  from public.outreach_contacts c
  join lateral (
    select aa.activity_at from public.outreach_activities aa
    where aa.contact_id = c.id and aa.activity_type = 'request_sent'
    order by aa.activity_at desc limit 1
  ) a on true
  left join lateral (
    select rr.id from public.outreach_recommendations rr
    where rr.contact_id = c.id order by rr.verified_at desc, rr.id desc limit 1
  ) r on true
  where c.connection_status = 'request_sent'
    and a.activity_at <= now() - interval '14 days'
    and not exists (
      select 1 from public.outreach_relationship_tasks t
      where t.contact_id = c.id and t.task_type = 'withdraw_invitation'
        and t.status in ('due', 'queued', 'completed')
    );
  get diagnostics v_withdrawals = row_count;
  return query select v_followups, v_withdrawals;
end;
$$;

create or replace function outreach_private.record_inbound_message_signal(
  p_contact_id uuid, p_evidence_source text, p_external_evidence_key text,
  p_message_excerpt text, p_observed_at timestamptz default now()
)
returns table (event_id bigint, task_id bigint, duplicate_signal boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event_id bigint;
  v_task_id bigint;
begin
  if p_evidence_source not in ('gmail_signal', 'browser_assisted', 'manual') then raise exception 'Unsupported evidence source'; end if;
  if p_evidence_source = 'gmail_signal' and nullif(btrim(p_external_evidence_key), '') is null then raise exception 'Gmail signals require an external evidence key'; end if;
  if p_evidence_source = 'gmail_signal' and coalesce((select auth.role()), '') = 'authenticated' then raise exception 'Gmail signals must be recorded by the trusted connector'; end if;
  if v_user_id is not null and not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then raise exception 'This account is not approved for outreach'; end if;
  if not exists (select 1 from public.outreach_contacts c where c.id = p_contact_id) then raise exception 'Contact not found'; end if;
  if char_length(coalesce(p_message_excerpt, '')) > 1000 then raise exception 'Message excerpt must be 1000 characters or fewer'; end if;

  if p_external_evidence_key is not null then
    select e.id into v_event_id from public.outreach_conversation_events e
    where e.evidence_source = p_evidence_source and e.external_evidence_key = btrim(p_external_evidence_key);
    if v_event_id is not null then
      select t.id into v_task_id from public.outreach_conversation_tasks t
      where t.inbound_event_id = v_event_id order by t.id desc limit 1;
      return query select v_event_id, v_task_id, true;
      return;
    end if;
  end if;

  insert into public.outreach_conversation_events (
    contact_id, event_type, evidence_source, external_evidence_key,
    message_excerpt, observed_at, recorded_by
  ) values (
    p_contact_id, 'inbound_message', p_evidence_source,
    nullif(btrim(p_external_evidence_key), ''), nullif(btrim(p_message_excerpt), ''),
    p_observed_at, v_user_id
  ) returning id into v_event_id;

  update public.outreach_conversation_tasks
  set status = 'cancelled', completion_evidence = 'Superseded by an inbound LinkedIn message.', updated_at = now()
  where contact_id = p_contact_id and task_type = 'proactive_follow_up'
    and status in ('waiting', 'needs_review', 'approved', 'queued');

  insert into public.outreach_conversation_tasks (
    contact_id, recommendation_id, inbound_event_id, task_type, status,
    due_at, inbound_message, source
  )
  select p_contact_id, r.id, v_event_id, 'reply', 'context_required',
    p_observed_at, nullif(btrim(p_message_excerpt), ''), p_evidence_source
  from (select 1) x
  left join lateral (
    select rr.id from public.outreach_recommendations rr where rr.contact_id = p_contact_id
    order by rr.verified_at desc, rr.id desc limit 1
  ) r on true
  returning id into v_task_id;

  update public.outreach_contacts set connection_status = 'replied', updated_at = now()
  where id = p_contact_id and connection_status in ('connected', 'messaged');
  if not exists (
    select 1 from public.outreach_activities a
    where a.contact_id = p_contact_id and a.activity_type = 'reply_received'
      and a.activity_at = p_observed_at
  ) then
    insert into public.outreach_activities (contact_id, activity_type, activity_at, note, evidence_source, recorded_by)
    values (p_contact_id, 'reply_received', p_observed_at, 'Inbound LinkedIn message detected; reply requires review.', p_evidence_source, v_user_id);
  end if;
  insert into public.outreach_phase5_workflow_runs (requested_by, workflow_type, status, last_node, checkpoint)
  values (v_user_id, 'inbound_message', 'waiting_for_user', 'read_linkedin_conversation',
    jsonb_build_object('contact_id', p_contact_id, 'event_id', v_event_id, 'task_id', v_task_id));
  return query select v_event_id, v_task_id, false;
end;
$$;

create or replace function outreach_private.save_phase5_draft(
  p_task_id bigint, p_inbound_message text, p_draft_message text, p_evidence text
)
returns table (task_id bigint, task_type text, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_task public.outreach_conversation_tasks%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then raise exception 'This account is not approved for outreach'; end if;
  if nullif(btrim(p_draft_message), '') is null or char_length(p_draft_message) > 2000 then raise exception 'Draft must be 1-2000 characters'; end if;
  if char_length(coalesce(p_inbound_message, '')) > 5000 then raise exception 'Inbound message must be 5000 characters or fewer'; end if;
  if nullif(btrim(p_evidence), '') is null or char_length(p_evidence) > 1000 then raise exception 'Evidence must be 1-1000 characters'; end if;
  select * into v_task from public.outreach_conversation_tasks where id = p_task_id for update;
  if not found or v_task.status not in ('context_required', 'needs_review') then raise exception 'Task is not available for drafting'; end if;
  update public.outreach_conversation_tasks set inbound_message = nullif(btrim(p_inbound_message), ''),
    draft_message = btrim(p_draft_message), status = 'needs_review', completion_evidence = btrim(p_evidence), updated_at = now()
  where id = p_task_id;
  if v_task.inbound_event_id is not null and nullif(btrim(p_inbound_message), '') is not null then
    update public.outreach_conversation_events set message_body = btrim(p_inbound_message)
    where id = v_task.inbound_event_id;
  end if;
  insert into public.outreach_phase5_workflow_runs (requested_by, workflow_type, status, last_node, checkpoint)
  values (v_user_id, 'draft_preparation', 'waiting_for_user', 'review_draft', jsonb_build_object('task_id', p_task_id));
  return query select t.id, t.task_type, t.status, t.updated_at from public.outreach_conversation_tasks t where t.id = p_task_id;
end;
$$;

create or replace function outreach_private.approve_phase5_draft(p_task_id bigint, p_approved_message text)
returns table (task_id bigint, task_type text, status text, reviewed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_reviewed_at timestamptz := now();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then raise exception 'This account is not approved for outreach'; end if;
  if nullif(btrim(p_approved_message), '') is null or char_length(p_approved_message) > 2000 then raise exception 'Approved message must be 1-2000 characters'; end if;
  update public.outreach_conversation_tasks t set draft_message = btrim(p_approved_message), status = 'approved',
    reviewed_at = v_reviewed_at, reviewed_by = v_user_id, updated_at = v_reviewed_at
  where t.id = p_task_id and t.status = 'needs_review' and t.due_at <= now();
  if not found then raise exception 'Draft is not ready for review or its grace period has not ended'; end if;
  insert into public.outreach_phase5_workflow_runs (requested_by, workflow_type, status, last_node, checkpoint, completed_at)
  values (v_user_id, 'draft_review', 'completed', 'approved_for_batch', jsonb_build_object('task_id', p_task_id), v_reviewed_at);
  return query select t.id, t.task_type, t.status, t.reviewed_at from public.outreach_conversation_tasks t where t.id = p_task_id;
end;
$$;

create or replace function outreach_private.prepare_phase5_batch(p_task_ids bigint[])
returns table (batch_id uuid, batch_code text, action_type text, selected_count smallint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid()); v_count integer; v_valid integer; v_action text;
  v_batch public.outreach_phase5_batches%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then raise exception 'This account is not approved for outreach'; end if;
  v_count := coalesce(array_length(p_task_ids, 1), 0);
  if v_count < 1 or v_count > 15 then raise exception 'Select between 1 and 15 approved tasks'; end if;
  if (select count(distinct x) from unnest(p_task_ids) x) <> v_count then raise exception 'The batch contains duplicate tasks'; end if;
  select min(t.task_type), count(*) into v_action, v_valid from public.outreach_conversation_tasks t
  where t.id = any(p_task_ids) and t.status = 'approved' and t.due_at <= now() and t.draft_message is not null;
  if v_valid <> v_count or (select count(distinct t.task_type) from public.outreach_conversation_tasks t where t.id = any(p_task_ids)) <> 1 then
    raise exception 'Tasks must all be approved, due, and have the same action type';
  end if;
  if exists (
    select 1 from public.outreach_conversation_tasks t join public.outreach_activities a on a.contact_id = t.contact_id
    where t.id = any(p_task_ids) and a.activity_type in ('message_sent', 'follow_up') and a.activity_at >= t.created_at
  ) then raise exception 'A selected task already has sent-message evidence'; end if;

  update public.outreach_phase5_sessions s set status = 'cancelled', updated_at = now(), evidence = 'Superseded by a new batch.'
  from public.outreach_phase5_batches b where s.batch_id = b.id and b.requested_by = v_user_id and b.action_type = v_action and s.status = 'prepared';
  update public.outreach_phase5_batches b set status = 'cancelled', completed_at = now(), updated_at = now()
  where b.requested_by = v_user_id and b.action_type = v_action and b.status in ('ready', 'running');
  update public.outreach_conversation_tasks set status = 'approved', updated_at = now()
  where status = 'queued' and id in (
    select s.task_id from public.outreach_phase5_sessions s join public.outreach_phase5_batches b on b.id = s.batch_id
    where b.requested_by = v_user_id and b.status = 'cancelled'
  );

  insert into public.outreach_phase5_batches (requested_by, action_type, selected_count)
  values (v_user_id, v_action, v_count::smallint) returning * into v_batch;
  insert into public.outreach_phase5_sessions (
    batch_id, task_id, contact_id, requested_by, sequence_no, action_type,
    profile_url_snapshot, inbound_message_snapshot, message_snapshot
  )
  select v_batch.id, t.id, t.contact_id, v_user_id, x.ordinality::smallint, t.task_type,
    c.linkedin_profile_url, t.inbound_message, t.draft_message
  from unnest(p_task_ids) with ordinality x(task_id, ordinality)
  join public.outreach_conversation_tasks t on t.id = x.task_id
  join public.outreach_contacts c on c.id = t.contact_id order by x.ordinality;
  update public.outreach_conversation_tasks set status = 'queued', updated_at = now() where id = any(p_task_ids);
  insert into public.outreach_phase5_workflow_runs (requested_by, workflow_type, status, last_node, checkpoint)
  values (v_user_id, case when v_action = 'reply' then 'reply_batch' else 'proactive_follow_up_batch' end,
    'waiting_for_user', 'browser_execution', jsonb_build_object('batch_id', v_batch.id, 'selected_count', v_count));
  return query select v_batch.id, upper(substr(replace(v_batch.id::text, '-', ''), 1, 8)),
    v_batch.action_type, v_batch.selected_count, v_batch.created_at;
end;
$$;

create or replace function outreach_private.get_phase5_batch(p_batch_code text default null)
returns table (
  batch_id uuid, batch_code text, batch_status text, action_type text, selected_count smallint,
  session_id uuid, sequence_no smallint, task_id bigint, contact_id uuid, full_name text,
  employer text, current_title text, profile_url text, inbound_message text,
  message_text text, session_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with chosen as (
    select b.* from public.outreach_phase5_batches b
    where b.requested_by = (select auth.uid()) and (
      (p_batch_code is null and b.status in ('ready', 'running')) or
      upper(substr(replace(b.id::text, '-', ''), 1, 8)) = upper(btrim(p_batch_code))
    ) order by b.created_at desc limit 1
  )
  select b.id, upper(substr(replace(b.id::text, '-', ''), 1, 8)), b.status, b.action_type, b.selected_count,
    s.id, s.sequence_no, s.task_id, s.contact_id, c.full_name, c.employer, c.current_title,
    s.profile_url_snapshot, s.inbound_message_snapshot, s.message_snapshot, s.status
  from chosen b join public.outreach_phase5_sessions s on s.batch_id = b.id
  join public.outreach_contacts c on c.id = s.contact_id order by s.sequence_no
$$;

create or replace function outreach_private.finalize_phase5_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_prepared integer; v_completed integer; v_skipped integer; v_failed integer; v_status text;
begin
  select count(*) filter (where status = 'prepared'), count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'skipped'), count(*) filter (where status = 'failed')
  into v_prepared, v_completed, v_skipped, v_failed from public.outreach_phase5_sessions where batch_id = p_batch_id;
  v_status := case when v_prepared > 0 then 'running' when v_failed > 0 or (v_completed > 0 and v_skipped > 0) then 'partially_completed' else 'completed' end;
  update public.outreach_phase5_batches set status = v_status, started_at = coalesce(started_at, now()),
    completed_at = case when v_prepared = 0 then now() else null end, updated_at = now() where id = p_batch_id;
  update public.outreach_phase5_workflow_runs set status = case when v_prepared > 0 then 'waiting_for_user'
      when v_status = 'completed' then 'completed' else 'partially_completed' end,
    last_node = case when v_prepared > 0 then 'browser_execution' else 'batch_finalized' end,
    completed_at = case when v_prepared = 0 then now() else null end, updated_at = now(),
    checkpoint = checkpoint || jsonb_build_object('completed', v_completed, 'skipped', v_skipped, 'failed', v_failed)
  where checkpoint->>'batch_id' = p_batch_id::text;
end;
$$;

create or replace function outreach_private.confirm_phase5_action(p_session_id uuid, p_confirmation_signal text)
returns table (session_id uuid, contact_id uuid, action_type text, contact_status text, activity_id bigint, completed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid()); v_session public.outreach_phase5_sessions%rowtype;
  v_task public.outreach_conversation_tasks%rowtype; v_activity_id bigint;
  v_completed_at timestamptz := now(); v_status text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select s.* into v_session from public.outreach_phase5_sessions s
  where s.id = p_session_id and s.requested_by = v_user_id for update;
  if not found or v_session.status <> 'prepared' then raise exception 'Prepared session not found or already resolved'; end if;
  select t.* into v_task from public.outreach_conversation_tasks t where t.id = v_session.task_id for update;
  if v_session.action_type = 'reply' and p_confirmation_signal <> 'linkedin_reply_sent_visible' then raise exception 'Visible LinkedIn reply confirmation is required'; end if;
  if v_session.action_type = 'proactive_follow_up' and p_confirmation_signal <> 'linkedin_follow_up_sent_visible' then raise exception 'Visible LinkedIn follow-up confirmation is required'; end if;
  if exists (
    select 1 from public.outreach_activities a where a.contact_id = v_session.contact_id
      and a.activity_type in ('message_sent', 'follow_up') and a.activity_at >= v_task.created_at
  ) then raise exception 'This task already has sent-message evidence'; end if;
  insert into public.outreach_activities (contact_id, activity_type, activity_at, note, evidence_source, recorded_by)
  values (v_session.contact_id, case when v_session.action_type = 'reply' then 'message_sent' else 'follow_up' end,
    v_completed_at, case when v_session.action_type = 'reply' then 'Contextual reply sent after visible LinkedIn confirmation.'
      else 'Proactive follow-up sent after visible LinkedIn confirmation.' end,
    'browser_assisted', v_user_id) returning id into v_activity_id;
  update public.outreach_contacts set connection_status = case when v_session.action_type = 'reply' then 'replied' else 'messaged' end,
    updated_at = v_completed_at where id = v_session.contact_id;
  v_status := case when v_session.action_type = 'reply' then 'replied' else 'messaged' end;
  update public.outreach_conversation_tasks set status = 'completed', completed_at = v_completed_at,
    completion_evidence = p_confirmation_signal, updated_at = v_completed_at where id = v_task.id;
  update public.outreach_phase5_sessions set status = 'completed', confirmation_signal = p_confirmation_signal,
    evidence = 'Visible LinkedIn success confirmed.', completed_at = v_completed_at, updated_at = v_completed_at where id = p_session_id;
  perform outreach_private.finalize_phase5_batch(v_session.batch_id);
  return query select p_session_id, v_session.contact_id, v_session.action_type, v_status, v_activity_id, v_completed_at;
end;
$$;

create or replace function outreach_private.skip_phase5_action(p_session_id uuid, p_skip_reason text, p_evidence text)
returns table (session_id uuid, contact_id uuid, action_type text, session_status text, skipped_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_session public.outreach_phase5_sessions%rowtype; v_skipped_at timestamptz := now();
begin
  if p_skip_reason not in ('already_sent', 'reply_exists', 'not_connected', 'profile_mismatch', 'ambiguous', 'newer_message') then raise exception 'Unsupported skip reason'; end if;
  if nullif(btrim(p_evidence), '') is null or char_length(p_evidence) > 1000 then raise exception 'Visible evidence must be 1-1000 characters'; end if;
  select s.* into v_session from public.outreach_phase5_sessions s
  where s.id = p_session_id and s.requested_by = v_user_id for update;
  if not found or v_session.status <> 'prepared' then raise exception 'Prepared session not found or already resolved'; end if;
  update public.outreach_phase5_sessions set status = 'skipped', skip_reason = p_skip_reason,
    evidence = btrim(p_evidence), completed_at = v_skipped_at, updated_at = v_skipped_at where id = p_session_id;
  update public.outreach_conversation_tasks set status = case when p_skip_reason in ('ambiguous', 'profile_mismatch', 'newer_message') then 'needs_review' else 'skipped' end,
    completion_evidence = btrim(p_evidence), completed_at = case when p_skip_reason in ('ambiguous', 'profile_mismatch', 'newer_message') then null else v_skipped_at end,
    updated_at = v_skipped_at where id = v_session.task_id;
  perform outreach_private.finalize_phase5_batch(v_session.batch_id);
  return query select p_session_id, v_session.contact_id, v_session.action_type, 'skipped'::text, v_skipped_at;
end;
$$;

create function public.record_inbound_message_signal(
  p_contact_id uuid, p_evidence_source text, p_external_evidence_key text,
  p_message_excerpt text, p_observed_at timestamptz default now()
)
returns table (event_id bigint, task_id bigint, duplicate_signal boolean)
language sql security invoker set search_path = ''
as $$ select * from outreach_private.record_inbound_message_signal(
  p_contact_id, p_evidence_source, p_external_evidence_key, p_message_excerpt, p_observed_at
) $$;

create function public.save_phase5_draft(p_task_id bigint, p_inbound_message text, p_draft_message text, p_evidence text)
returns table (task_id bigint, task_type text, status text, updated_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from outreach_private.save_phase5_draft(p_task_id, p_inbound_message, p_draft_message, p_evidence) $$;

create function public.approve_phase5_draft(p_task_id bigint, p_approved_message text)
returns table (task_id bigint, task_type text, status text, reviewed_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from outreach_private.approve_phase5_draft(p_task_id, p_approved_message) $$;

create function public.prepare_phase5_batch(p_task_ids bigint[])
returns table (batch_id uuid, batch_code text, action_type text, selected_count smallint, created_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from outreach_private.prepare_phase5_batch(p_task_ids) $$;

create function public.get_phase5_batch(p_batch_code text default null)
returns table (
  batch_id uuid, batch_code text, batch_status text, action_type text, selected_count smallint,
  session_id uuid, sequence_no smallint, task_id bigint, contact_id uuid, full_name text,
  employer text, current_title text, profile_url text, inbound_message text,
  message_text text, session_status text
)
language sql stable security invoker set search_path = ''
as $$ select * from outreach_private.get_phase5_batch(p_batch_code) $$;

create function public.confirm_phase5_action(p_session_id uuid, p_confirmation_signal text)
returns table (session_id uuid, contact_id uuid, action_type text, contact_status text, activity_id bigint, completed_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from outreach_private.confirm_phase5_action(p_session_id, p_confirmation_signal) $$;

create function public.skip_phase5_action(p_session_id uuid, p_skip_reason text, p_evidence text)
returns table (session_id uuid, contact_id uuid, action_type text, session_status text, skipped_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from outreach_private.skip_phase5_action(p_session_id, p_skip_reason, p_evidence) $$;

revoke all on function outreach_private.phase5_follow_up_draft(uuid),
  outreach_private.record_inbound_message_signal(uuid, text, text, text, timestamptz),
  outreach_private.save_phase5_draft(bigint, text, text, text),
  outreach_private.approve_phase5_draft(bigint, text), outreach_private.prepare_phase5_batch(bigint[]),
  outreach_private.get_phase5_batch(text), outreach_private.finalize_phase5_batch(uuid),
  outreach_private.confirm_phase5_action(uuid, text), outreach_private.skip_phase5_action(uuid, text, text)
from public, anon;
grant execute on function outreach_private.phase5_follow_up_draft(uuid),
  outreach_private.record_inbound_message_signal(uuid, text, text, text, timestamptz),
  outreach_private.save_phase5_draft(bigint, text, text, text),
  outreach_private.approve_phase5_draft(bigint, text), outreach_private.prepare_phase5_batch(bigint[]),
  outreach_private.get_phase5_batch(text), outreach_private.confirm_phase5_action(uuid, text),
  outreach_private.skip_phase5_action(uuid, text, text) to authenticated;
grant execute on function outreach_private.record_inbound_message_signal(uuid, text, text, text, timestamptz) to service_role;

revoke all on function public.record_inbound_message_signal(uuid, text, text, text, timestamptz),
  public.save_phase5_draft(bigint, text, text, text), public.approve_phase5_draft(bigint, text),
  public.prepare_phase5_batch(bigint[]), public.get_phase5_batch(text),
  public.confirm_phase5_action(uuid, text), public.skip_phase5_action(uuid, text, text)
from public, anon;
grant execute on function public.record_inbound_message_signal(uuid, text, text, text, timestamptz),
  public.save_phase5_draft(bigint, text, text, text), public.approve_phase5_draft(bigint, text),
  public.prepare_phase5_batch(bigint[]), public.get_phase5_batch(text),
  public.confirm_phase5_action(uuid, text), public.skip_phase5_action(uuid, text, text)
to authenticated;
grant execute on function public.record_inbound_message_signal(uuid, text, text, text, timestamptz) to service_role;

comment on table public.outreach_conversation_tasks is 'Human-reviewed reply and proactive follow-up tasks. Inbound messages always supersede silent follow-ups.';
comment on function public.record_inbound_message_signal(uuid, text, text, text, timestamptz) is 'Records an idempotent inbound-message signal and routes it to contextual reply preparation.';
comment on function public.approve_phase5_draft(bigint, text) is 'Human approval gate required before a conversation task can enter a browser batch.';
