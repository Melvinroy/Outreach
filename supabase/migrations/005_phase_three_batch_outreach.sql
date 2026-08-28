-- Phase 3 correction: one user-selected batch replaces one handoff per contact.
-- Queueing freezes recipients and messages but never records an outreach result.

create table if not exists public.outreach_assist_batches (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ready' check (
    status in ('ready', 'running', 'awaiting_confirmation', 'completed', 'partially_completed', 'cancelled', 'failed')
  ),
  selected_count smallint not null check (selected_count between 1 and 15),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.outreach_assist_batches is
  'User-owned batches of frozen outreach targets. A batch is preparation, not evidence that outreach occurred.';

create index if not exists outreach_assist_batches_owner_created_idx
  on public.outreach_assist_batches(requested_by, created_at desc);
create unique index if not exists outreach_assist_batches_one_active_idx
  on public.outreach_assist_batches(requested_by)
  where status in ('ready', 'running', 'awaiting_confirmation');

alter table public.outreach_assist_batches enable row level security;

drop policy if exists "Allowlisted users can read their assisted batches" on public.outreach_assist_batches;
create policy "Allowlisted users can read their assisted batches"
on public.outreach_assist_batches for select to authenticated
using (
  requested_by = (select auth.uid())
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "Allowlisted users can create their assisted batches" on public.outreach_assist_batches;
create policy "Allowlisted users can create their assisted batches"
on public.outreach_assist_batches for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "Allowlisted users can update their assisted batches" on public.outreach_assist_batches;
create policy "Allowlisted users can update their assisted batches"
on public.outreach_assist_batches for update to authenticated
using (
  requested_by = (select auth.uid())
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
)
with check (
  requested_by = (select auth.uid())
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

alter table public.outreach_assist_sessions
  add column if not exists batch_id uuid references public.outreach_assist_batches(id) on delete cascade,
  add column if not exists sequence_no smallint check (sequence_no is null or sequence_no between 1 and 15);

create unique index if not exists outreach_assist_sessions_batch_sequence_idx
  on public.outreach_assist_sessions(batch_id, sequence_no)
  where batch_id is not null;

create index if not exists outreach_assist_sessions_batch_idx
  on public.outreach_assist_sessions(batch_id, status, sequence_no);

revoke all on table public.outreach_assist_batches from public, anon;
revoke insert, update, delete on table public.outreach_assist_batches from authenticated;
grant select on table public.outreach_assist_batches to authenticated;
grant insert (requested_by, status, selected_count, created_at, started_at, completed_at, updated_at)
  on table public.outreach_assist_batches to authenticated;
grant update (status, started_at, completed_at, updated_at)
  on table public.outreach_assist_batches to authenticated;
grant insert (batch_id, sequence_no) on table public.outreach_assist_sessions to authenticated;

create or replace function public.prepare_browser_assisted_batch(
  p_recommendation_ids bigint[]
)
returns table (
  batch_id uuid,
  batch_code text,
  selected_count smallint,
  status text,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_selected_count integer;
  v_valid_count integer;
  v_batch public.outreach_assist_batches%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then
    raise exception 'This account is not approved for outreach';
  end if;

  v_selected_count := coalesce(array_length(p_recommendation_ids, 1), 0);
  if v_selected_count < 1 or v_selected_count > 15 then
    raise exception 'Select between 1 and 15 contacts for a Codex batch';
  end if;

  if (select count(distinct recommendation_id) from unnest(p_recommendation_ids) as recommendation_id) <> v_selected_count then
    raise exception 'The batch contains duplicate recommendations';
  end if;

  select count(*) into v_valid_count
  from unnest(p_recommendation_ids) with ordinality as selected(recommendation_id, sequence_no)
  join public.outreach_recommendations r on r.id = selected.recommendation_id
  join public.outreach_contacts c on c.id = r.contact_id
  where c.connection_status = 'not_contacted'
    and c.linkedin_profile_url ~ '^https?://'
    and char_length(r.personalized_message) between 1 and 300;

  if v_valid_count <> v_selected_count then
    raise exception 'One or more selected contacts are no longer ready or have invalid outreach data';
  end if;

  -- A newly queued batch intentionally supersedes the user's previous unfinished batch.
  update public.outreach_assist_sessions s
  set status = 'cancelled',
      failure_reason = 'Superseded by a newly selected batch.',
      updated_at = now()
  where s.requested_by = v_user_id
    and s.status = 'prepared';

  update public.outreach_assist_batches b
  set status = 'cancelled',
      completed_at = now(),
      updated_at = now()
  where b.requested_by = v_user_id
    and b.status in ('ready', 'running', 'awaiting_confirmation');

  insert into public.outreach_assist_batches (requested_by, selected_count)
  values (v_user_id, v_selected_count::smallint)
  returning * into v_batch;

  insert into public.outreach_assist_sessions (
    batch_id, sequence_no, contact_id, recommendation_id, requested_by,
    profile_url_snapshot, message_snapshot
  )
  select
    v_batch.id, selected.sequence_no::smallint, c.id, r.id, v_user_id,
    c.linkedin_profile_url, r.personalized_message
  from unnest(p_recommendation_ids) with ordinality as selected(recommendation_id, sequence_no)
  join public.outreach_recommendations r on r.id = selected.recommendation_id
  join public.outreach_contacts c on c.id = r.contact_id
  order by selected.sequence_no;

  return query select
    v_batch.id,
    upper(substr(replace(v_batch.id::text, '-', ''), 1, 8)),
    v_batch.selected_count,
    v_batch.status,
    v_batch.created_at;
end;
$$;

create or replace function public.get_browser_assisted_batch(
  p_batch_code text default null
)
returns table (
  batch_id uuid,
  batch_code text,
  batch_status text,
  selected_count smallint,
  session_id uuid,
  sequence_no smallint,
  recommendation_id bigint,
  contact_id uuid,
  full_name text,
  employer text,
  current_title text,
  profile_url text,
  message_text text,
  session_status text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_batch_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select b.id into v_batch_id
  from public.outreach_assist_batches b
  where b.requested_by = (select auth.uid())
    and (
      (p_batch_code is null and b.status in ('ready', 'running', 'awaiting_confirmation'))
      or upper(substr(replace(b.id::text, '-', ''), 1, 8)) = upper(btrim(p_batch_code))
    )
  order by b.created_at desc
  limit 1;

  if v_batch_id is null then
    raise exception 'No matching active outreach batch was found';
  end if;

  return query
  select
    b.id,
    upper(substr(replace(b.id::text, '-', ''), 1, 8)),
    b.status,
    b.selected_count,
    s.id,
    s.sequence_no,
    s.recommendation_id,
    s.contact_id,
    c.full_name,
    c.employer,
    c.current_title,
    s.profile_url_snapshot,
    s.message_snapshot,
    s.status
  from public.outreach_assist_batches b
  join public.outreach_assist_sessions s on s.batch_id = b.id
  join public.outreach_contacts c on c.id = s.contact_id
  where b.id = v_batch_id
  order by s.sequence_no;
end;
$$;

create or replace function public.start_browser_assisted_batch(
  p_batch_id uuid
)
returns table (batch_id uuid, status text, started_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  update public.outreach_assist_batches b
  set status = 'running',
      started_at = coalesce(b.started_at, now()),
      updated_at = now()
  where b.id = p_batch_id
    and b.requested_by = (select auth.uid())
    and b.status in ('ready', 'running', 'awaiting_confirmation');

  if not found then
    raise exception 'Active outreach batch not found or access denied';
  end if;

  return query
  select b.id, b.status, b.started_at
  from public.outreach_assist_batches b
  where b.id = p_batch_id;
end;
$$;

-- Extend the original visible-success function so batch progress remains accurate.
create or replace function public.confirm_browser_assisted_outreach(
  p_session_id uuid,
  p_confirmation_signal text
)
returns table (
  session_id uuid,
  contact_id uuid,
  connection_status text,
  activity_id bigint,
  activity_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.outreach_assist_sessions%rowtype;
  v_activity_id bigint;
  v_activity_at timestamptz;
  v_remaining integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_confirmation_signal <> 'linkedin_invitation_sent_visible' then
    raise exception 'A visible LinkedIn invitation confirmation is required';
  end if;

  select s.* into v_session
  from public.outreach_assist_sessions s
  where s.id = p_session_id
    and s.requested_by = (select auth.uid())
  for update;

  if not found then
    raise exception 'Assisted session not found or access denied';
  end if;
  if v_session.status <> 'prepared' then
    raise exception 'Assisted session is already %', v_session.status;
  end if;

  update public.outreach_contacts c
  set connection_status = 'request_sent', updated_at = now()
  where c.id = v_session.contact_id and c.connection_status = 'not_contacted';
  if not found then
    raise exception 'Contact status changed; refresh before recording this attempt';
  end if;

  insert into public.outreach_activities (
    contact_id, activity_type, activity_at, note, evidence_source, recorded_by
  ) values (
    v_session.contact_id, 'request_sent', now(),
    'Completed from a supervised Codex batch after visible LinkedIn confirmation.',
    'browser_assisted', (select auth.uid())
  )
  returning id, outreach_activities.activity_at into v_activity_id, v_activity_at;

  update public.outreach_assist_sessions
  set status = 'completed', confirmation_signal = p_confirmation_signal,
      completed_at = v_activity_at, updated_at = v_activity_at
  where id = p_session_id;

  if v_session.batch_id is not null then
    select count(*) into v_remaining
    from public.outreach_assist_sessions s
    where s.batch_id = v_session.batch_id and s.status = 'prepared';

    update public.outreach_assist_batches b
    set status = case when v_remaining = 0 then 'completed' else 'running' end,
        started_at = coalesce(b.started_at, v_activity_at),
        completed_at = case when v_remaining = 0 then v_activity_at else null end,
        updated_at = v_activity_at
    where b.id = v_session.batch_id and b.requested_by = (select auth.uid());
  end if;

  return query select p_session_id, v_session.contact_id, 'request_sent'::text, v_activity_id, v_activity_at;
end;
$$;

revoke all on function public.prepare_browser_assisted_batch(bigint[]) from public, anon;
revoke all on function public.get_browser_assisted_batch(text) from public, anon;
revoke all on function public.start_browser_assisted_batch(uuid) from public, anon;
grant execute on function public.prepare_browser_assisted_batch(bigint[]) to authenticated;
grant execute on function public.get_browser_assisted_batch(text) to authenticated;
grant execute on function public.start_browser_assisted_batch(uuid) to authenticated;

comment on function public.prepare_browser_assisted_batch(bigint[]) is
  'Freezes 1-15 selected recommendations as one Codex batch without recording outreach.';
comment on function public.get_browser_assisted_batch(text) is
  'Returns the authenticated user''s exact frozen batch in execution order.';
comment on function public.start_browser_assisted_batch(uuid) is
  'Marks a prepared batch as running; it does not record any outreach outcome.';
