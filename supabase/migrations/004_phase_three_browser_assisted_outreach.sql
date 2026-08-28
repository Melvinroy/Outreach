-- Phase 3: supervised browser-assisted LinkedIn outreach.
-- Preparing a session never counts as outreach. Only an explicit visible
-- platform confirmation completes the session and appends request_sent.

create table if not exists public.outreach_assist_sessions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  recommendation_id bigint not null references public.outreach_recommendations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'prepared' check (
    status in ('prepared', 'completed', 'cancelled', 'failed')
  ),
  action_type text not null default 'request_sent' check (
    action_type in ('request_sent')
  ),
  profile_url_snapshot text not null,
  message_snapshot text not null check (
    char_length(message_snapshot) between 1 and 300
  ),
  confirmation_signal text check (
    confirmation_signal is null or confirmation_signal in ('linkedin_invitation_sent_visible')
  ),
  failure_reason text,
  prepared_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.outreach_assist_sessions is
  'Auditable, user-owned browser-assistance sessions. Prepared sessions are not outreach outcomes.';

create index if not exists outreach_assist_sessions_contact_idx
  on public.outreach_assist_sessions(contact_id, prepared_at desc);
create index if not exists outreach_assist_sessions_requested_by_idx
  on public.outreach_assist_sessions(requested_by, prepared_at desc);
create index if not exists outreach_assist_sessions_recommendation_idx
  on public.outreach_assist_sessions(recommendation_id);
create unique index if not exists outreach_assist_sessions_one_active_per_contact_idx
  on public.outreach_assist_sessions(requested_by, contact_id)
  where status = 'prepared';

alter table public.outreach_assist_sessions enable row level security;

drop policy if exists "Allowlisted users can read their assisted sessions" on public.outreach_assist_sessions;
create policy "Allowlisted users can read their assisted sessions"
on public.outreach_assist_sessions for select to authenticated
using (
  requested_by = (select auth.uid())
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "Allowlisted users can create their assisted sessions" on public.outreach_assist_sessions;
create policy "Allowlisted users can create their assisted sessions"
on public.outreach_assist_sessions for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "Allowlisted users can update their assisted sessions" on public.outreach_assist_sessions;
create policy "Allowlisted users can update their assisted sessions"
on public.outreach_assist_sessions for update to authenticated
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

drop policy if exists "Allowlisted users can append manual outreach activities" on public.outreach_activities;
drop policy if exists "Allowlisted users can append browser-assisted activities" on public.outreach_activities;
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
      and activity_type = 'request_sent'
    )
  )
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

revoke all on table public.outreach_assist_sessions from public, anon;
revoke insert, update, delete on table public.outreach_assist_sessions from authenticated;
grant select on table public.outreach_assist_sessions to authenticated;
grant insert (
  contact_id, recommendation_id, requested_by, status, action_type,
  profile_url_snapshot, message_snapshot, confirmation_signal, failure_reason,
  prepared_at, completed_at, updated_at
) on table public.outreach_assist_sessions to authenticated;
grant update (
  status, confirmation_signal, failure_reason, completed_at, updated_at
) on table public.outreach_assist_sessions to authenticated;

create or replace function public.prepare_browser_assisted_outreach(
  p_contact_id uuid,
  p_recommendation_id bigint
)
returns table (
  session_id uuid,
  status text,
  profile_url text,
  message_text text,
  prepared_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.outreach_assist_sessions%rowtype;
  v_contact public.outreach_contacts%rowtype;
  v_message text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select c.* into v_contact
  from public.outreach_contacts c
  where c.id = p_contact_id;

  if not found then
    raise exception 'Contact not found or access denied';
  end if;

  if v_contact.connection_status <> 'not_contacted' then
    raise exception 'This contact is no longer ready for a connection request';
  end if;

  select r.personalized_message into v_message
  from public.outreach_recommendations r
  where r.id = p_recommendation_id
    and r.contact_id = p_contact_id;

  if not found then
    raise exception 'Recommendation does not match this contact';
  end if;

  select s.* into v_session
  from public.outreach_assist_sessions s
  where s.requested_by = (select auth.uid())
    and s.contact_id = p_contact_id
    and s.status = 'prepared'
  order by s.prepared_at desc
  limit 1;

  if not found then
    insert into public.outreach_assist_sessions (
      contact_id, recommendation_id, requested_by,
      profile_url_snapshot, message_snapshot
    ) values (
      p_contact_id, p_recommendation_id, (select auth.uid()),
      v_contact.linkedin_profile_url, v_message
    )
    returning * into v_session;
  end if;

  return query select
    v_session.id,
    v_session.status,
    v_session.profile_url_snapshot,
    v_session.message_snapshot,
    v_session.prepared_at;
end;
$$;

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
  set connection_status = 'request_sent',
      updated_at = now()
  where c.id = v_session.contact_id
    and c.connection_status = 'not_contacted';

  if not found then
    raise exception 'Contact status changed; refresh before recording this attempt';
  end if;

  insert into public.outreach_activities (
    contact_id, activity_type, activity_at, note, evidence_source, recorded_by
  ) values (
    v_session.contact_id, 'request_sent', now(),
    'Completed from a supervised browser session after visible LinkedIn confirmation.',
    'browser_assisted', (select auth.uid())
  )
  returning id, outreach_activities.activity_at
  into v_activity_id, v_activity_at;

  update public.outreach_assist_sessions
  set status = 'completed',
      confirmation_signal = p_confirmation_signal,
      completed_at = v_activity_at,
      updated_at = v_activity_at
  where id = p_session_id;

  return query select
    p_session_id,
    v_session.contact_id,
    'request_sent'::text,
    v_activity_id,
    v_activity_at;
end;
$$;

create or replace function public.cancel_browser_assisted_outreach(
  p_session_id uuid,
  p_failure_reason text default null
)
returns table (
  session_id uuid,
  status text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_failure_reason is not null and char_length(p_failure_reason) > 500 then
    raise exception 'Failure reason must be 500 characters or fewer';
  end if;

  update public.outreach_assist_sessions s
  set status = case when nullif(btrim(p_failure_reason), '') is null then 'cancelled' else 'failed' end,
      failure_reason = nullif(btrim(p_failure_reason), ''),
      updated_at = now()
  where s.id = p_session_id
    and s.requested_by = (select auth.uid())
    and s.status = 'prepared';

  if not found then
    raise exception 'Prepared assisted session not found or access denied';
  end if;

  return query select
    p_session_id,
    case when nullif(btrim(p_failure_reason), '') is null then 'cancelled' else 'failed' end;
end;
$$;

revoke all on function public.prepare_browser_assisted_outreach(uuid, bigint) from public, anon;
revoke all on function public.confirm_browser_assisted_outreach(uuid, text) from public, anon;
revoke all on function public.cancel_browser_assisted_outreach(uuid, text) from public, anon;
grant execute on function public.prepare_browser_assisted_outreach(uuid, bigint) to authenticated;
grant execute on function public.confirm_browser_assisted_outreach(uuid, text) to authenticated;
grant execute on function public.cancel_browser_assisted_outreach(uuid, text) to authenticated;

comment on function public.prepare_browser_assisted_outreach(uuid, bigint) is
  'Freezes the approved target and message without recording an outreach outcome.';
comment on function public.confirm_browser_assisted_outreach(uuid, text) is
  'Records request_sent only after the caller attests to a visible LinkedIn success signal.';
comment on function public.cancel_browser_assisted_outreach(uuid, text) is
  'Closes a prepared assisted session without changing the relationship funnel.';
