-- Phase 6: safe self-onboarding, user-owned preferences, privacy operations,
-- and missing Phase 5 foreign-key indexes. No installation-specific seed data.

create table if not exists public.outreach_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  professional_summary text,
  target_roles text[] not null default '{}',
  target_locations text[] not null default '{}',
  target_companies text[] not null default '{}',
  message_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(message_preferences) = 'object'),
  invitation_withdrawal_days smallint not null default 14 check (invitation_withdrawal_days between 7 and 90),
  follow_up_grace_hours smallint not null default 6 check (follow_up_grace_hours between 1 and 72),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_user_settings enable row level security;

drop policy if exists "Users manage their own outreach settings" on public.outreach_user_settings;
create policy "Users manage their own outreach settings"
on public.outreach_user_settings for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.outreach_user_settings from public, anon;
grant select, insert, update, delete on table public.outreach_user_settings to authenticated;

create schema if not exists outreach_private;
revoke all on schema outreach_private from public, anon;
grant usage on schema outreach_private to authenticated, service_role;

create or replace function outreach_private.claim_outreach_owner()
returns table (claimed boolean, user_id uuid, onboarding_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  lock table public.outreach_app_access in exclusive mode;

  if exists (select 1 from public.outreach_app_access) then
    if not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then
      raise exception 'This installation already has an owner';
    end if;
  else
    insert into public.outreach_app_access(user_id, label)
    values (v_user_id, 'Installation owner');
  end if;

  insert into public.outreach_user_settings(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return query
  select true, v_user_id, s.onboarding_completed
  from public.outreach_user_settings s
  where s.user_id = v_user_id;
end;
$$;

revoke all on function outreach_private.claim_outreach_owner() from public, anon;
grant execute on function outreach_private.claim_outreach_owner() to authenticated;

create or replace function public.claim_outreach_owner()
returns table (claimed boolean, user_id uuid, onboarding_completed boolean)
language sql
security invoker
set search_path = ''
as $$ select * from outreach_private.claim_outreach_owner() $$;

revoke all on function public.claim_outreach_owner() from public, anon;
grant execute on function public.claim_outreach_owner() to authenticated;

create or replace function outreach_private.delete_outreach_workspace_data(p_confirmation text)
returns table (deleted boolean, deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deleted_at timestamptz := now();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_confirmation <> 'DELETE ALL OUTREACH DATA' then raise exception 'Exact deletion confirmation required'; end if;
  if not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then
    raise exception 'Owner access required';
  end if;

  delete from public.outreach_phase5_batches;
  delete from public.outreach_phase4_batches;
  delete from public.outreach_assist_batches;
  delete from public.outreach_conversation_tasks;
  delete from public.outreach_relationship_tasks;
  delete from public.outreach_conversation_events;
  delete from public.outreach_reconciliation_events;
  delete from public.outreach_discovery_duplicates;
  delete from public.outreach_activities;
  delete from public.outreach_recommendations;
  delete from public.outreach_contacts;
  delete from public.outreach_runs;
  delete from public.outreach_user_settings where user_id = v_user_id;

  return query select true, v_deleted_at;
end;
$$;

revoke all on function outreach_private.delete_outreach_workspace_data(text) from public, anon;
grant execute on function outreach_private.delete_outreach_workspace_data(text) to authenticated;

create or replace function public.delete_outreach_workspace_data(p_confirmation text)
returns table (deleted boolean, deleted_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from outreach_private.delete_outreach_workspace_data(p_confirmation) $$;

revoke all on function public.delete_outreach_workspace_data(text) from public, anon;
grant execute on function public.delete_outreach_workspace_data(text) to authenticated;

create index if not exists outreach_conversation_events_recorded_by_idx
  on public.outreach_conversation_events(recorded_by);
create index if not exists outreach_conversation_tasks_inbound_event_idx
  on public.outreach_conversation_tasks(inbound_event_id);
create index if not exists outreach_conversation_tasks_recommendation_idx
  on public.outreach_conversation_tasks(recommendation_id);
create index if not exists outreach_conversation_tasks_reviewed_by_idx
  on public.outreach_conversation_tasks(reviewed_by);
create index if not exists outreach_phase5_sessions_contact_idx
  on public.outreach_phase5_sessions(contact_id);
create index if not exists outreach_phase5_sessions_requested_by_idx
  on public.outreach_phase5_sessions(requested_by);
create index if not exists outreach_phase5_sessions_task_idx
  on public.outreach_phase5_sessions(task_id);

comment on table public.outreach_user_settings is
  'Private per-user setup and messaging preferences. No reusable release may seed a real person profile.';
comment on function public.claim_outreach_owner() is
  'Atomically claims an unowned personal installation for the first authenticated user; never replaces an existing owner.';
comment on function public.delete_outreach_workspace_data(text) is
  'Deletes relationship records and personalization only after exact owner confirmation; authentication and the anti-takeover ownership record remain intact.';
