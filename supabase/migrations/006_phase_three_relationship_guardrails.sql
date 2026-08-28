-- Phase 3 guardrails: classify pre-existing LinkedIn relationship states as
-- measurable skips, not failures, and keep them out of the send path.

alter table public.outreach_assist_sessions
  drop constraint if exists outreach_assist_sessions_status_check;

alter table public.outreach_assist_sessions
  add constraint outreach_assist_sessions_status_check check (
    status in ('prepared', 'completed', 'skipped', 'cancelled', 'failed')
  ),
  add column if not exists skip_reason text check (
    skip_reason is null or skip_reason in (
      'already_pending', 'already_connected', 'previously_contacted'
    )
  ),
  add column if not exists preflight_evidence text check (
    preflight_evidence is null or char_length(preflight_evidence) <= 500
  ),
  add column if not exists preflight_checked_at timestamptz;

create index if not exists outreach_assist_sessions_guardrail_idx
  on public.outreach_assist_sessions(requested_by, skip_reason, preflight_checked_at desc)
  where status = 'skipped';

grant update (skip_reason, preflight_evidence, preflight_checked_at)
  on table public.outreach_assist_sessions to authenticated;

drop policy if exists "Allowlisted users can append confirmed outreach activities" on public.outreach_activities;
create policy "Allowlisted users can append confirmed outreach activities"
on public.outreach_activities for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and (
    (
      evidence_source = 'manual'
      and activity_type in (
        'request_sent', 'connected', 'message_sent', 'reply_received',
        'follow_up', 'meeting_scheduled', 'referral', 'closed', 'note'
      )
    )
    or (
      evidence_source = 'browser_assisted'
      and activity_type in ('request_sent', 'connected')
    )
  )
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

create or replace function public.skip_browser_assisted_outreach(
  p_session_id uuid,
  p_skip_reason text,
  p_preflight_evidence text
)
returns table (
  session_id uuid,
  contact_id uuid,
  session_status text,
  skip_reason text,
  connection_status text,
  activity_id bigint,
  skipped_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.outreach_assist_sessions%rowtype;
  v_skipped_at timestamptz := now();
  v_connection_status text;
  v_activity_type text;
  v_activity_id bigint;
  v_active integer;
  v_completed integer;
  v_skipped integer;
  v_failed integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_skip_reason not in ('already_pending', 'already_connected', 'previously_contacted') then
    raise exception 'Unsupported relationship guardrail outcome';
  end if;

  if nullif(btrim(p_preflight_evidence), '') is null then
    raise exception 'Visible preflight evidence is required';
  end if;

  if char_length(p_preflight_evidence) > 500 then
    raise exception 'Preflight evidence must be 500 characters or fewer';
  end if;

  select s.* into v_session
  from public.outreach_assist_sessions s
  where s.id = p_session_id
    and s.requested_by = v_user_id
  for update;

  if not found then
    raise exception 'Assisted session not found or access denied';
  end if;

  if v_session.status <> 'prepared' then
    raise exception 'Assisted session is already %', v_session.status;
  end if;

  if p_skip_reason = 'already_pending' then
    v_connection_status := 'request_sent';
    v_activity_type := 'request_sent';
  elsif p_skip_reason = 'already_connected' then
    v_connection_status := 'connected';
    v_activity_type := 'connected';
  end if;

  if v_connection_status is not null then
    update public.outreach_contacts c
    set connection_status = v_connection_status,
        updated_at = v_skipped_at
    where c.id = v_session.contact_id
      and c.connection_status = 'not_contacted';

    select a.id into v_activity_id
    from public.outreach_activities a
    where a.contact_id = v_session.contact_id
      and a.activity_type = v_activity_type
    order by a.activity_at desc
    limit 1;

    if v_activity_id is null then
      insert into public.outreach_activities (
        contact_id, activity_type, activity_at, note, evidence_source, recorded_by
      ) values (
        v_session.contact_id,
        v_activity_type,
        v_skipped_at,
        case p_skip_reason
          when 'already_pending' then 'Pre-existing pending LinkedIn invitation observed during browser preflight; no invitation was sent in this batch.'
          else 'Pre-existing first-degree LinkedIn connection observed during browser preflight; no invitation was sent in this batch.'
        end,
        'browser_assisted',
        v_user_id
      )
      returning id into v_activity_id;
    end if;
  else
    select c.connection_status into v_connection_status
    from public.outreach_contacts c
    where c.id = v_session.contact_id;
  end if;

  update public.outreach_assist_sessions s
  set status = 'skipped',
      skip_reason = p_skip_reason,
      preflight_evidence = btrim(p_preflight_evidence),
      preflight_checked_at = v_skipped_at,
      failure_reason = null,
      completed_at = v_skipped_at,
      updated_at = v_skipped_at
  where s.id = p_session_id;

  if v_session.batch_id is not null then
    select
      count(*) filter (where s.status = 'prepared'),
      count(*) filter (where s.status = 'completed'),
      count(*) filter (where s.status = 'skipped'),
      count(*) filter (where s.status = 'failed')
    into v_active, v_completed, v_skipped, v_failed
    from public.outreach_assist_sessions s
    where s.batch_id = v_session.batch_id;

    update public.outreach_assist_batches b
    set status = case
          when v_active > 0 then 'running'
          when v_failed > 0 or (v_completed > 0 and v_skipped > 0) then 'partially_completed'
          else 'completed'
        end,
        started_at = coalesce(b.started_at, v_skipped_at),
        completed_at = case when v_active = 0 then v_skipped_at else null end,
        updated_at = v_skipped_at
    where b.id = v_session.batch_id
      and b.requested_by = v_user_id;
  end if;

  return query select
    p_session_id,
    v_session.contact_id,
    'skipped'::text,
    p_skip_reason,
    v_connection_status,
    v_activity_id,
    v_skipped_at;
end;
$$;

-- Keep batch finalization accurate when confirmed sends coexist with guardrail skips.
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
  v_active integer;
  v_skipped integer;
  v_failed integer;
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
    select
      count(*) filter (where s.status = 'prepared'),
      count(*) filter (where s.status = 'skipped'),
      count(*) filter (where s.status = 'failed')
    into v_active, v_skipped, v_failed
    from public.outreach_assist_sessions s
    where s.batch_id = v_session.batch_id;

    update public.outreach_assist_batches b
    set status = case
          when v_active > 0 then 'running'
          when v_skipped > 0 or v_failed > 0 then 'partially_completed'
          else 'completed'
        end,
        started_at = coalesce(b.started_at, v_activity_at),
        completed_at = case when v_active = 0 then v_activity_at else null end,
        updated_at = v_activity_at
    where b.id = v_session.batch_id and b.requested_by = (select auth.uid());
  end if;

  return query select p_session_id, v_session.contact_id, 'request_sent'::text, v_activity_id, v_activity_at;
end;
$$;

-- Block contacts with known outreach evidence or a prior guardrail disposition
-- even when a stale contact row still says not_contacted.
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
  if v_user_id is null then raise exception 'Authentication required'; end if;
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
    and char_length(r.personalized_message) between 1 and 300
    and not exists (
      select 1 from public.outreach_activities a
      where a.contact_id = c.id
        and a.activity_type in ('request_sent', 'connected', 'message_sent', 'follow_up', 'reply_received', 'meeting_scheduled', 'referral')
    )
    and not exists (
      select 1 from public.outreach_assist_sessions s
      where s.requested_by = v_user_id
        and s.contact_id = c.id
        and s.status = 'skipped'
        and s.skip_reason in ('already_pending', 'already_connected', 'previously_contacted')
    );

  if v_valid_count <> v_selected_count then
    raise exception 'One or more selected contacts already have relationship evidence or are no longer ready';
  end if;

  update public.outreach_assist_sessions s
  set status = 'cancelled', failure_reason = 'Superseded by a newly selected batch.', updated_at = now()
  where s.requested_by = v_user_id and s.status = 'prepared';

  update public.outreach_assist_batches b
  set status = 'cancelled', completed_at = now(), updated_at = now()
  where b.requested_by = v_user_id and b.status in ('ready', 'running', 'awaiting_confirmation');

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

drop function if exists public.get_browser_assisted_batch(text);
create function public.get_browser_assisted_batch(
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
  session_status text,
  guardrail_outcome text,
  preflight_evidence text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_batch_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select b.id into v_batch_id
  from public.outreach_assist_batches b
  where b.requested_by = (select auth.uid())
    and (
      (p_batch_code is null and b.status in ('ready', 'running', 'awaiting_confirmation'))
      or upper(substr(replace(b.id::text, '-', ''), 1, 8)) = upper(btrim(p_batch_code))
    )
  order by b.created_at desc
  limit 1;

  if v_batch_id is null then raise exception 'No matching active outreach batch was found'; end if;

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
    s.status,
    s.skip_reason,
    s.preflight_evidence
  from public.outreach_assist_batches b
  join public.outreach_assist_sessions s on s.batch_id = b.id
  join public.outreach_contacts c on c.id = s.contact_id
  where b.id = v_batch_id
  order by s.sequence_no;
end;
$$;

revoke all on function public.skip_browser_assisted_outreach(uuid, text, text) from public, anon;
revoke all on function public.get_browser_assisted_batch(text) from public, anon;
grant execute on function public.skip_browser_assisted_outreach(uuid, text, text) to authenticated;
grant execute on function public.get_browser_assisted_batch(text) to authenticated;

comment on function public.skip_browser_assisted_outreach(uuid, text, text) is
  'Records a visible pre-existing LinkedIn relationship state and skips sending without counting it as a batch failure.';

-- Reclassify the legacy preflight outcome from the first production batch.
update public.outreach_assist_sessions s
set status = 'skipped',
    skip_reason = 'already_pending',
    preflight_evidence = 'LinkedIn displayed Pending before the batch attempted any send action.',
    preflight_checked_at = coalesce(s.updated_at, now()),
    completed_at = coalesce(s.completed_at, s.updated_at, now()),
    failure_reason = null
where s.status = 'failed'
  and s.failure_reason = 'already_pending_on_linkedin_before_run';

insert into public.outreach_activities (
  contact_id, activity_type, activity_at, note, evidence_source, recorded_by
)
select
  s.contact_id,
  'request_sent',
  coalesce(s.preflight_checked_at, now()),
  'Pre-existing pending LinkedIn invitation observed during browser preflight; no invitation was sent in this batch.',
  'browser_assisted',
  s.requested_by
from public.outreach_assist_sessions s
where s.status = 'skipped'
  and s.skip_reason = 'already_pending'
  and not exists (
    select 1 from public.outreach_activities a
    where a.contact_id = s.contact_id and a.activity_type = 'request_sent'
  );

update public.outreach_contacts c
set connection_status = 'request_sent', updated_at = now()
where c.connection_status = 'not_contacted'
  and exists (
    select 1 from public.outreach_assist_sessions s
    where s.contact_id = c.id
      and s.status = 'skipped'
      and s.skip_reason = 'already_pending'
  );
