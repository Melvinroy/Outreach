-- Phase 2: allowlisted, human-supervised relationship tracking.
-- The browser records explicit evidence; it never infers activity from LinkedIn.

alter table public.outreach_activities
  add column if not exists evidence_source text not null default 'system',
  add column if not exists recorded_by uuid references auth.users(id) on delete set null;

alter table public.outreach_activities
  drop constraint if exists outreach_activities_activity_type_check;

alter table public.outreach_activities
  add constraint outreach_activities_activity_type_check check (
    activity_type in (
      'recommended', 'request_sent', 'connected', 'message_sent',
      'reply_received', 'follow_up', 'meeting_scheduled', 'referral',
      'closed', 'note'
    )
  );

alter table public.outreach_activities
  drop constraint if exists outreach_activities_evidence_source_check;

alter table public.outreach_activities
  add constraint outreach_activities_evidence_source_check check (
    evidence_source in ('system', 'manual', 'browser_assisted', 'import')
  );

update public.outreach_activities
set evidence_source = 'system'
where activity_type = 'recommended';

create index if not exists outreach_activities_recorded_by_idx
  on public.outreach_activities(recorded_by);

drop policy if exists "Allowlisted users can update outreach contacts" on public.outreach_contacts;
create policy "Allowlisted users can update outreach contacts"
on public.outreach_contacts for update to authenticated
using (
  exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "Allowlisted users can append manual outreach activities" on public.outreach_activities;
create policy "Allowlisted users can append manual outreach activities"
on public.outreach_activities for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and evidence_source = 'manual'
  and activity_type in (
    'request_sent', 'connected', 'message_sent', 'reply_received',
    'follow_up', 'meeting_scheduled', 'referral', 'closed', 'note'
  )
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

revoke insert, update, delete on table public.outreach_contacts from authenticated;
grant update (connection_status, notes, updated_at) on table public.outreach_contacts to authenticated;

revoke insert, update, delete on table public.outreach_activities from authenticated;
grant insert (contact_id, activity_type, activity_at, note, evidence_source, recorded_by)
  on table public.outreach_activities to authenticated;
grant usage, select on sequence public.outreach_activities_id_seq to authenticated;

create or replace function public.record_outreach_activity(
  p_contact_id uuid,
  p_activity_type text,
  p_note text default null
)
returns table (
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
  v_status text;
  v_activity_id bigint;
  v_activity_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_note is not null and char_length(p_note) > 2000 then
    raise exception 'Notes must be 2000 characters or fewer';
  end if;

  v_status := case p_activity_type
    when 'request_sent' then 'request_sent'
    when 'connected' then 'connected'
    when 'message_sent' then 'messaged'
    when 'follow_up' then 'messaged'
    when 'reply_received' then 'replied'
    when 'meeting_scheduled' then 'meeting_scheduled'
    when 'referral' then 'referred'
    when 'closed' then 'closed'
    else null
  end;

  if v_status is null then
    raise exception 'Unsupported outreach activity: %', p_activity_type;
  end if;

  update public.outreach_contacts
  set connection_status = v_status,
      updated_at = now()
  where id = p_contact_id;

  if not found then
    raise exception 'Contact not found or access denied';
  end if;

  insert into public.outreach_activities (
    contact_id, activity_type, activity_at, note, evidence_source, recorded_by
  ) values (
    p_contact_id, p_activity_type, now(), nullif(btrim(p_note), ''), 'manual', (select auth.uid())
  )
  returning id, outreach_activities.activity_at
  into v_activity_id, v_activity_at;

  return query select p_contact_id, v_status, v_activity_id, v_activity_at;
end;
$$;

revoke all on function public.record_outreach_activity(uuid, text, text) from public;
revoke all on function public.record_outreach_activity(uuid, text, text) from anon;
grant execute on function public.record_outreach_activity(uuid, text, text) to authenticated;

comment on function public.record_outreach_activity(uuid, text, text) is
  'Atomically records an allowlisted user-confirmed outreach event and advances the contact status.';
