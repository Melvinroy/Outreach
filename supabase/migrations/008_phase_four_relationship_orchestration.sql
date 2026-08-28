-- Phase 4: durable acceptance reconciliation, follow-up and stale-invitation queues.
-- Email is a detection signal only. LinkedIn actions require visible browser confirmation.

alter table public.outreach_contacts
  drop constraint if exists outreach_contacts_connection_status_check;
alter table public.outreach_contacts
  add constraint outreach_contacts_connection_status_check check (
    connection_status in (
      'not_contacted', 'request_sent', 'connected', 'messaged', 'replied',
      'meeting_scheduled', 'referred', 'withdrawn', 'closed'
    )
  );

alter table public.outreach_activities
  drop constraint if exists outreach_activities_activity_type_check;
alter table public.outreach_activities
  add constraint outreach_activities_activity_type_check check (
    activity_type in (
      'recommended', 'request_sent', 'connected', 'message_sent',
      'reply_received', 'follow_up', 'meeting_scheduled', 'referral',
      'invitation_withdrawn', 'closed', 'note'
    )
  );

alter table public.outreach_activities
  drop constraint if exists outreach_activities_evidence_source_check;
alter table public.outreach_activities
  add constraint outreach_activities_evidence_source_check check (
    evidence_source in ('system', 'manual', 'browser_assisted', 'gmail_signal', 'import')
  );

create table public.outreach_reconciliation_events (
  id bigint generated always as identity primary key,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  observed_state text not null check (observed_state in ('accepted', 'pending', 'withdrawn', 'ambiguous')),
  evidence_source text not null check (evidence_source in ('gmail_signal', 'browser_assisted', 'manual')),
  external_evidence_key text,
  evidence_summary text not null check (char_length(evidence_summary) between 1 and 500),
  observed_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index outreach_reconciliation_external_evidence_uq
  on public.outreach_reconciliation_events(evidence_source, external_evidence_key)
  where external_evidence_key is not null;
create index outreach_reconciliation_contact_idx
  on public.outreach_reconciliation_events(contact_id, observed_at desc);

create table public.outreach_relationship_tasks (
  id bigint generated always as identity primary key,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  recommendation_id bigint references public.outreach_recommendations(id) on delete set null,
  task_type text not null check (task_type in ('follow_up', 'withdraw_invitation')),
  status text not null default 'due' check (status in ('due', 'queued', 'completed', 'skipped', 'cancelled')),
  due_at timestamptz not null,
  draft_message text check (draft_message is null or char_length(draft_message) between 1 and 1000),
  source text not null check (source in ('gmail_signal', 'browser_assisted', 'manual', 'system')),
  source_event_id bigint references public.outreach_reconciliation_events(id) on delete set null,
  completed_at timestamptz,
  completion_evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((task_type = 'follow_up' and draft_message is not null) or task_type = 'withdraw_invitation')
);

create unique index outreach_relationship_tasks_one_active_uq
  on public.outreach_relationship_tasks(contact_id, task_type)
  where status in ('due', 'queued');
create index outreach_relationship_tasks_due_idx
  on public.outreach_relationship_tasks(status, task_type, due_at);

create table public.outreach_phase4_batches (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('follow_up', 'withdraw_invitation')),
  selected_count smallint not null check (selected_count between 1 and 15),
  status text not null default 'ready' check (status in ('ready', 'running', 'completed', 'partially_completed', 'cancelled', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index outreach_phase4_batches_one_active_uq
  on public.outreach_phase4_batches(requested_by, action_type)
  where status in ('ready', 'running');

create table public.outreach_phase4_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.outreach_phase4_batches(id) on delete cascade,
  task_id bigint not null references public.outreach_relationship_tasks(id) on delete restrict,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  sequence_no smallint not null check (sequence_no between 1 and 15),
  action_type text not null check (action_type in ('follow_up', 'withdraw_invitation')),
  profile_url_snapshot text not null check (profile_url_snapshot ~ '^https?://'),
  message_snapshot text,
  status text not null default 'prepared' check (status in ('prepared', 'completed', 'skipped', 'cancelled', 'failed')),
  confirmation_signal text,
  skip_reason text check (skip_reason is null or skip_reason in ('already_sent', 'reply_exists', 'already_connected', 'not_pending', 'profile_mismatch', 'ambiguous')),
  evidence text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, sequence_no),
  unique (batch_id, task_id),
  check ((action_type = 'follow_up' and message_snapshot is not null) or action_type = 'withdraw_invitation')
);

create index outreach_phase4_sessions_batch_idx
  on public.outreach_phase4_sessions(batch_id, status, sequence_no);

create table public.outreach_phase4_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete cascade,
  workflow_type text not null check (workflow_type in ('task_refresh', 'acceptance_reconciliation', 'follow_up_batch', 'withdrawal_batch')),
  thread_id uuid not null default gen_random_uuid(),
  status text not null check (status in ('running', 'waiting_for_user', 'completed', 'partially_completed', 'failed')),
  last_node text not null,
  checkpoint jsonb not null default '{}'::jsonb check (jsonb_typeof(checkpoint) = 'object'),
  retry_count smallint not null default 0 check (retry_count between 0 and 20),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index outreach_phase4_workflow_runs_owner_idx
  on public.outreach_phase4_workflow_runs(requested_by, started_at desc);

alter table public.outreach_reconciliation_events enable row level security;
alter table public.outreach_relationship_tasks enable row level security;
alter table public.outreach_phase4_batches enable row level security;
alter table public.outreach_phase4_sessions enable row level security;
alter table public.outreach_phase4_workflow_runs enable row level security;

create policy "Allowlisted users read reconciliation events"
on public.outreach_reconciliation_events for select to authenticated
using (exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));
create policy "Allowlisted users read relationship tasks"
on public.outreach_relationship_tasks for select to authenticated
using (exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));
create policy "Owners read phase4 batches"
on public.outreach_phase4_batches for select to authenticated
using (requested_by = (select auth.uid()) and exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));
create policy "Owners read phase4 sessions"
on public.outreach_phase4_sessions for select to authenticated
using (requested_by = (select auth.uid()) and exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));
create policy "Owners read phase4 workflow runs"
on public.outreach_phase4_workflow_runs for select to authenticated
using ((requested_by = (select auth.uid()) or requested_by is null) and exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid())));

revoke all on public.outreach_reconciliation_events, public.outreach_relationship_tasks,
  public.outreach_phase4_batches, public.outreach_phase4_sessions,
  public.outreach_phase4_workflow_runs from public, anon, authenticated;
grant select on public.outreach_reconciliation_events, public.outreach_relationship_tasks,
  public.outreach_phase4_batches, public.outreach_phase4_sessions,
  public.outreach_phase4_workflow_runs to authenticated;

create or replace function public.phase4_follow_up_draft(p_contact_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'Hi ' || split_part(c.full_name, ' ', 1) ||
    ', thanks for connecting. I was especially interested in ' ||
    coalesce(nullif(r.opening_title, ''), 'the work your team is leading') ||
    ' at ' || c.employer ||
    '. I would value your perspective on the team''s current priorities and where my background could be most useful.'
  from public.outreach_contacts c
  left join lateral (
    select rr.opening_title
    from public.outreach_recommendations rr
    where rr.contact_id = c.id
    order by rr.verified_at desc, rr.id desc
    limit 1
  ) r on true
  where c.id = p_contact_id
$$;

create or replace function public.refresh_outreach_relationship_tasks()
returns table (follow_ups_created integer, withdrawals_created integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_followups integer := 0;
  v_withdrawals integer := 0;
  v_run_id uuid;
begin
  if v_user_id is not null and not exists (
    select 1 from public.outreach_app_access a where a.user_id = v_user_id
  ) then raise exception 'This account is not approved for outreach'; end if;

  insert into public.outreach_phase4_workflow_runs (requested_by, workflow_type, status, last_node, checkpoint)
  values (v_user_id, 'task_refresh', 'running', 'scan_relationship_events', '{}'::jsonb)
  returning id into v_run_id;

  insert into public.outreach_relationship_tasks (
    contact_id, recommendation_id, task_type, status, due_at, draft_message, source
  )
  select c.id, r.id, 'follow_up', 'due', coalesce(a.activity_at, now()),
    public.phase4_follow_up_draft(c.id),
    case
      when a.evidence_source = 'gmail_signal' then 'gmail_signal'
      when a.evidence_source in ('browser_assisted', 'manual') then a.evidence_source
      else 'system'
    end
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
      select 1 from public.outreach_activities sent
      where sent.contact_id = c.id and sent.activity_type in ('message_sent', 'follow_up')
        and sent.activity_at >= coalesce(a.activity_at, '-infinity'::timestamptz)
    )
    and not exists (
      select 1 from public.outreach_relationship_tasks t
      where t.contact_id = c.id and t.task_type = 'follow_up'
        and t.status in ('due', 'queued', 'completed')
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

  update public.outreach_phase4_workflow_runs
  set status = 'completed', last_node = 'tasks_ready', completed_at = now(), updated_at = now(),
      checkpoint = jsonb_build_object('follow_ups_created', v_followups, 'withdrawals_created', v_withdrawals)
  where id = v_run_id;
  return query select v_followups, v_withdrawals;
end;
$$;

create or replace function public.record_connection_reconciliation(
  p_contact_id uuid,
  p_observed_state text,
  p_evidence_source text,
  p_external_evidence_key text,
  p_evidence_summary text,
  p_observed_at timestamptz default now()
)
returns table (event_id bigint, contact_status text, task_id bigint, duplicate_signal boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event_id bigint;
  v_task_id bigint;
  v_status text;
  v_run_id uuid;
begin
  if p_observed_state not in ('accepted', 'pending', 'withdrawn', 'ambiguous') then raise exception 'Unsupported observed state'; end if;
  if p_evidence_source not in ('gmail_signal', 'browser_assisted', 'manual') then raise exception 'Unsupported evidence source'; end if;
  if p_evidence_source = 'gmail_signal' and nullif(btrim(p_external_evidence_key), '') is null then raise exception 'Gmail signals require an external evidence key'; end if;
  if p_evidence_source = 'gmail_signal' and coalesce((select auth.role()), '') = 'authenticated' then raise exception 'Gmail signals must be recorded by the trusted connector'; end if;
  if nullif(btrim(p_evidence_summary), '') is null or char_length(p_evidence_summary) > 500 then raise exception 'Evidence summary must be 1-500 characters'; end if;
  if v_user_id is not null and not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then raise exception 'This account is not approved for outreach'; end if;
  if not exists (select 1 from public.outreach_contacts c where c.id = p_contact_id) then raise exception 'Contact not found'; end if;

  if p_external_evidence_key is not null then
    select e.id into v_event_id from public.outreach_reconciliation_events e
    where e.evidence_source = p_evidence_source and e.external_evidence_key = btrim(p_external_evidence_key);
    if v_event_id is not null then
      select c.connection_status into v_status from public.outreach_contacts c where c.id = p_contact_id;
      select t.id into v_task_id from public.outreach_relationship_tasks t
      where t.contact_id = p_contact_id and t.status in ('due', 'queued') order by t.created_at desc limit 1;
      return query select v_event_id, v_status, v_task_id, true;
      return;
    end if;
  end if;

  insert into public.outreach_phase4_workflow_runs (requested_by, workflow_type, status, last_node, checkpoint)
  values (v_user_id, 'acceptance_reconciliation', 'running', 'validate_signal', jsonb_build_object('contact_id', p_contact_id, 'source', p_evidence_source))
  returning id into v_run_id;

  insert into public.outreach_reconciliation_events (
    contact_id, observed_state, evidence_source, external_evidence_key,
    evidence_summary, observed_at, recorded_by
  ) values (
    p_contact_id, p_observed_state, p_evidence_source, nullif(btrim(p_external_evidence_key), ''),
    btrim(p_evidence_summary), p_observed_at, v_user_id
  ) returning id into v_event_id;

  if p_observed_state = 'accepted' then
    update public.outreach_contacts set connection_status = 'connected', updated_at = now()
    where id = p_contact_id and connection_status in ('not_contacted', 'request_sent');
    if not exists (select 1 from public.outreach_activities a where a.contact_id = p_contact_id and a.activity_type = 'connected') then
      insert into public.outreach_activities (contact_id, activity_type, activity_at, note, evidence_source, recorded_by)
      values (p_contact_id, 'connected', p_observed_at, 'Connection acceptance reconciled from verified evidence.', p_evidence_source, v_user_id);
    end if;
    update public.outreach_relationship_tasks set status = 'cancelled', updated_at = now(), completion_evidence = 'Connection accepted before withdrawal.'
    where contact_id = p_contact_id and task_type = 'withdraw_invitation' and status in ('due', 'queued');
    perform public.refresh_outreach_relationship_tasks();
  elsif p_observed_state = 'pending' then
    update public.outreach_contacts set connection_status = 'request_sent', updated_at = now()
    where id = p_contact_id and connection_status = 'not_contacted';
  elsif p_observed_state = 'withdrawn' then
    update public.outreach_contacts set connection_status = 'withdrawn', updated_at = now()
    where id = p_contact_id and connection_status = 'request_sent';
  end if;

  select c.connection_status into v_status from public.outreach_contacts c where c.id = p_contact_id;
  select t.id into v_task_id from public.outreach_relationship_tasks t
  where t.contact_id = p_contact_id and t.status in ('due', 'queued') order by t.created_at desc limit 1;
  update public.outreach_phase4_workflow_runs set status = case when p_observed_state = 'ambiguous' then 'waiting_for_user' else 'completed' end,
    last_node = case when p_observed_state = 'ambiguous' then 'manual_review' else 'tasks_refreshed' end,
    completed_at = case when p_observed_state = 'ambiguous' then null else now() end, updated_at = now(),
    checkpoint = checkpoint || jsonb_build_object('event_id', v_event_id, 'observed_state', p_observed_state, 'task_id', v_task_id)
  where id = v_run_id;
  return query select v_event_id, v_status, v_task_id, false;
end;
$$;

create or replace function public.prepare_phase4_batch(p_task_ids bigint[])
returns table (batch_id uuid, batch_code text, action_type text, selected_count smallint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer;
  v_valid integer;
  v_action text;
  v_batch public.outreach_phase4_batches%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then raise exception 'This account is not approved for outreach'; end if;
  v_count := coalesce(array_length(p_task_ids, 1), 0);
  if v_count < 1 or v_count > 15 then raise exception 'Select between 1 and 15 tasks'; end if;
  if (select count(distinct x) from unnest(p_task_ids) x) <> v_count then raise exception 'The batch contains duplicate tasks'; end if;
  select min(t.task_type), count(*) into v_action, v_valid
  from public.outreach_relationship_tasks t where t.id = any(p_task_ids) and t.status = 'due' and t.due_at <= now();
  if v_valid <> v_count or (select count(distinct t.task_type) from public.outreach_relationship_tasks t where t.id = any(p_task_ids)) <> 1 then
    raise exception 'Tasks must all be due and have the same action type';
  end if;
  if v_action = 'follow_up' and exists (
    select 1 from public.outreach_relationship_tasks t join public.outreach_activities a on a.contact_id = t.contact_id
    where t.id = any(p_task_ids) and a.activity_type in ('message_sent', 'follow_up') and a.activity_at >= t.created_at
  ) then raise exception 'A selected follow-up already has sent-message evidence'; end if;

  update public.outreach_phase4_sessions s set status = 'cancelled', updated_at = now(), evidence = 'Superseded by a new batch.'
  from public.outreach_phase4_batches b where s.batch_id = b.id and b.requested_by = v_user_id and b.action_type = v_action and s.status = 'prepared';
  update public.outreach_phase4_batches b set status = 'cancelled', completed_at = now(), updated_at = now()
  where b.requested_by = v_user_id and b.action_type = v_action and b.status in ('ready', 'running');
  update public.outreach_relationship_tasks t set status = 'due', updated_at = now()
  where t.status = 'queued' and exists (
    select 1 from public.outreach_phase4_sessions s join public.outreach_phase4_batches b on b.id = s.batch_id
    where s.task_id = t.id and b.requested_by = v_user_id and b.status = 'cancelled'
  );

  insert into public.outreach_phase4_batches (requested_by, action_type, selected_count)
  values (v_user_id, v_action, v_count::smallint) returning * into v_batch;
  insert into public.outreach_phase4_sessions (
    batch_id, task_id, contact_id, requested_by, sequence_no, action_type,
    profile_url_snapshot, message_snapshot
  )
  select v_batch.id, t.id, t.contact_id, v_user_id, x.ordinality::smallint, t.task_type,
    c.linkedin_profile_url, t.draft_message
  from unnest(p_task_ids) with ordinality x(task_id, ordinality)
  join public.outreach_relationship_tasks t on t.id = x.task_id
  join public.outreach_contacts c on c.id = t.contact_id order by x.ordinality;
  update public.outreach_relationship_tasks set status = 'queued', updated_at = now() where id = any(p_task_ids);
  insert into public.outreach_phase4_workflow_runs (requested_by, workflow_type, status, last_node, checkpoint)
  values (v_user_id, case when v_action = 'follow_up' then 'follow_up_batch' else 'withdrawal_batch' end,
    'waiting_for_user', 'browser_execution', jsonb_build_object('batch_id', v_batch.id, 'selected_count', v_count));
  return query select v_batch.id, upper(substr(replace(v_batch.id::text, '-', ''), 1, 8)), v_batch.action_type, v_batch.selected_count, v_batch.created_at;
end;
$$;

create or replace function public.get_phase4_batch(p_batch_code text default null)
returns table (
  batch_id uuid, batch_code text, batch_status text, action_type text, selected_count smallint,
  session_id uuid, sequence_no smallint, task_id bigint, contact_id uuid, full_name text,
  employer text, current_title text, profile_url text, message_text text, session_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with chosen as (
    select b.* from public.outreach_phase4_batches b
    where b.requested_by = (select auth.uid()) and (
      (p_batch_code is null and b.status in ('ready', 'running')) or
      upper(substr(replace(b.id::text, '-', ''), 1, 8)) = upper(btrim(p_batch_code))
    ) order by b.created_at desc limit 1
  )
  select b.id, upper(substr(replace(b.id::text, '-', ''), 1, 8)), b.status, b.action_type, b.selected_count,
    s.id, s.sequence_no, s.task_id, s.contact_id, c.full_name, c.employer, c.current_title,
    s.profile_url_snapshot, s.message_snapshot, s.status
  from chosen b join public.outreach_phase4_sessions s on s.batch_id = b.id
  join public.outreach_contacts c on c.id = s.contact_id order by s.sequence_no
$$;

create or replace function public.finalize_phase4_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_prepared integer; v_completed integer; v_skipped integer; v_failed integer; v_status text;
begin
  select count(*) filter (where status = 'prepared'), count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'skipped'), count(*) filter (where status = 'failed')
  into v_prepared, v_completed, v_skipped, v_failed from public.outreach_phase4_sessions where batch_id = p_batch_id;
  v_status := case when v_prepared > 0 then 'running' when v_failed > 0 or (v_completed > 0 and v_skipped > 0) then 'partially_completed' else 'completed' end;
  update public.outreach_phase4_batches set status = v_status,
    started_at = coalesce(started_at, now()), completed_at = case when v_prepared = 0 then now() else null end, updated_at = now()
  where id = p_batch_id;
  update public.outreach_phase4_workflow_runs set status = case when v_prepared > 0 then 'waiting_for_user' when v_status = 'completed' then 'completed' else 'partially_completed' end,
    last_node = case when v_prepared > 0 then 'browser_execution' else 'batch_finalized' end,
    completed_at = case when v_prepared = 0 then now() else null end, updated_at = now(),
    checkpoint = checkpoint || jsonb_build_object('completed', v_completed, 'skipped', v_skipped, 'failed', v_failed)
  where checkpoint->>'batch_id' = p_batch_id::text;
end;
$$;

create or replace function public.confirm_phase4_action(p_session_id uuid, p_confirmation_signal text)
returns table (session_id uuid, contact_id uuid, action_type text, contact_status text, activity_id bigint, completed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid()); v_session public.outreach_phase4_sessions%rowtype;
  v_task public.outreach_relationship_tasks%rowtype; v_activity_id bigint; v_completed_at timestamptz := now(); v_status text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select s.* into v_session from public.outreach_phase4_sessions s where s.id = p_session_id and s.requested_by = v_user_id for update;
  if not found or v_session.status <> 'prepared' then raise exception 'Prepared session not found or already resolved'; end if;
  select t.* into v_task from public.outreach_relationship_tasks t where t.id = v_session.task_id for update;
  if v_session.action_type = 'follow_up' then
    if p_confirmation_signal <> 'linkedin_message_sent_visible' then raise exception 'Visible LinkedIn message confirmation is required'; end if;
    if exists (select 1 from public.outreach_activities a where a.contact_id = v_session.contact_id and a.activity_type in ('message_sent', 'follow_up') and a.activity_at >= v_task.created_at) then raise exception 'This follow-up already has sent-message evidence'; end if;
    update public.outreach_contacts set connection_status = 'messaged', updated_at = v_completed_at
    where id = v_session.contact_id and connection_status = 'connected';
    if not found then raise exception 'Contact is no longer in the connected state'; end if;
    insert into public.outreach_activities (contact_id, activity_type, activity_at, note, evidence_source, recorded_by)
    values (v_session.contact_id, 'follow_up', v_completed_at, 'First follow-up sent after visible LinkedIn confirmation.', 'browser_assisted', v_user_id)
    returning id into v_activity_id; v_status := 'messaged';
  else
    if p_confirmation_signal <> 'linkedin_invitation_withdrawn_visible' then raise exception 'Visible LinkedIn withdrawal confirmation is required'; end if;
    update public.outreach_contacts set connection_status = 'withdrawn', updated_at = v_completed_at
    where id = v_session.contact_id and connection_status = 'request_sent';
    if not found then raise exception 'Contact is no longer pending; reconcile before withdrawing'; end if;
    insert into public.outreach_activities (contact_id, activity_type, activity_at, note, evidence_source, recorded_by)
    values (v_session.contact_id, 'invitation_withdrawn', v_completed_at, 'Stale invitation withdrawn after visible LinkedIn confirmation.', 'browser_assisted', v_user_id)
    returning id into v_activity_id; v_status := 'withdrawn';
  end if;
  update public.outreach_relationship_tasks set status = 'completed', completed_at = v_completed_at,
    completion_evidence = p_confirmation_signal, updated_at = v_completed_at where id = v_task.id;
  update public.outreach_phase4_sessions set status = 'completed', confirmation_signal = p_confirmation_signal,
    evidence = 'Visible LinkedIn success confirmed.', completed_at = v_completed_at, updated_at = v_completed_at where id = p_session_id;
  perform public.finalize_phase4_batch(v_session.batch_id);
  return query select p_session_id, v_session.contact_id, v_session.action_type, v_status, v_activity_id, v_completed_at;
end;
$$;

create or replace function public.skip_phase4_action(p_session_id uuid, p_skip_reason text, p_evidence text)
returns table (session_id uuid, contact_id uuid, action_type text, session_status text, skipped_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_session public.outreach_phase4_sessions%rowtype; v_skipped_at timestamptz := now();
begin
  if p_skip_reason not in ('already_sent', 'reply_exists', 'already_connected', 'not_pending', 'profile_mismatch', 'ambiguous') then raise exception 'Unsupported skip reason'; end if;
  if nullif(btrim(p_evidence), '') is null or char_length(p_evidence) > 500 then raise exception 'Visible evidence must be 1-500 characters'; end if;
  select s.* into v_session from public.outreach_phase4_sessions s where s.id = p_session_id and s.requested_by = v_user_id for update;
  if not found or v_session.status <> 'prepared' then raise exception 'Prepared session not found or already resolved'; end if;
  update public.outreach_phase4_sessions set status = 'skipped', skip_reason = p_skip_reason,
    evidence = btrim(p_evidence), completed_at = v_skipped_at, updated_at = v_skipped_at where id = p_session_id;
  update public.outreach_relationship_tasks set status = case when p_skip_reason in ('ambiguous', 'profile_mismatch') then 'due' else 'skipped' end,
    completion_evidence = btrim(p_evidence), completed_at = case when p_skip_reason in ('ambiguous', 'profile_mismatch') then null else v_skipped_at end,
    updated_at = v_skipped_at where id = v_session.task_id;
  perform public.finalize_phase4_batch(v_session.batch_id);
  return query select p_session_id, v_session.contact_id, v_session.action_type, 'skipped'::text, v_skipped_at;
end;
$$;

drop policy if exists "Allowlisted users can append confirmed outreach activities" on public.outreach_activities;
create policy "Allowlisted users can append confirmed outreach activities"
on public.outreach_activities for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and (
    (evidence_source = 'manual' and activity_type in (
      'request_sent', 'connected', 'message_sent', 'reply_received', 'follow_up',
      'meeting_scheduled', 'referral', 'invitation_withdrawn', 'closed', 'note'
    ))
    or (evidence_source = 'browser_assisted' and activity_type in ('request_sent', 'connected'))
  )
  and exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid()))
);

create or replace function public.record_outreach_activity(
  p_contact_id uuid,
  p_activity_type text,
  p_note text default null
)
returns table (contact_id uuid, connection_status text, activity_id bigint, activity_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare v_status text; v_activity_id bigint; v_activity_at timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_note is not null and char_length(p_note) > 2000 then raise exception 'Notes must be 2000 characters or fewer'; end if;
  v_status := case p_activity_type
    when 'request_sent' then 'request_sent' when 'connected' then 'connected'
    when 'message_sent' then 'messaged' when 'follow_up' then 'messaged'
    when 'reply_received' then 'replied' when 'meeting_scheduled' then 'meeting_scheduled'
    when 'referral' then 'referred' when 'invitation_withdrawn' then 'withdrawn'
    when 'closed' then 'closed' else null end;
  if v_status is null then raise exception 'Unsupported outreach activity: %', p_activity_type; end if;
  update public.outreach_contacts set connection_status = v_status, updated_at = now() where id = p_contact_id;
  if not found then raise exception 'Contact not found or access denied'; end if;
  insert into public.outreach_activities (contact_id, activity_type, activity_at, note, evidence_source, recorded_by)
  values (p_contact_id, p_activity_type, now(), nullif(btrim(p_note), ''), 'manual', (select auth.uid()))
  returning id, outreach_activities.activity_at into v_activity_id, v_activity_at;
  return query select p_contact_id, v_status, v_activity_id, v_activity_at;
end;
$$;

revoke all on function public.phase4_follow_up_draft(uuid) from public, anon;
revoke all on function public.refresh_outreach_relationship_tasks() from public, anon;
revoke all on function public.record_connection_reconciliation(uuid, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.prepare_phase4_batch(bigint[]) from public, anon;
revoke all on function public.get_phase4_batch(text) from public, anon;
revoke all on function public.finalize_phase4_batch(uuid) from public, anon, authenticated;
revoke all on function public.confirm_phase4_action(uuid, text) from public, anon;
revoke all on function public.skip_phase4_action(uuid, text, text) from public, anon;
grant execute on function public.phase4_follow_up_draft(uuid), public.refresh_outreach_relationship_tasks(),
  public.record_connection_reconciliation(uuid, text, text, text, text, timestamptz),
  public.prepare_phase4_batch(bigint[]), public.get_phase4_batch(text),
  public.confirm_phase4_action(uuid, text), public.skip_phase4_action(uuid, text, text) to authenticated;
grant execute on function public.refresh_outreach_relationship_tasks(),
  public.record_connection_reconciliation(uuid, text, text, text, text, timestamptz) to service_role;

-- Refresh deterministic queues hourly. Gmail event detection remains a separate connector automation.
create extension if not exists pg_cron with schema extensions;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'outreach-phase4-task-refresh') then
    perform cron.unschedule('outreach-phase4-task-refresh');
  end if;
  perform cron.schedule('outreach-phase4-task-refresh', '17 * * * *', 'select public.refresh_outreach_relationship_tasks();');
end $$;

comment on table public.outreach_reconciliation_events is 'Idempotent evidence from Gmail, browser or manual checks. Ambiguous evidence never changes relationship status.';
comment on table public.outreach_relationship_tasks is 'One active task per contact/action; follow-up messages are frozen before browser execution.';
comment on function public.confirm_phase4_action(uuid, text) is 'Records an action only after the exact visible LinkedIn success signal.';
