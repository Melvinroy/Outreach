-- Keep privileged implementations outside the exposed API schema. Public RPCs
-- are security-invoker wrappers; the private functions retain all auth/allowlist checks.

create schema if not exists outreach_private;
revoke all on schema outreach_private from public, anon;
grant usage on schema outreach_private to authenticated, service_role;

alter function public.refresh_outreach_relationship_tasks() set schema outreach_private;
alter function public.record_connection_reconciliation(uuid, text, text, text, text, timestamptz) set schema outreach_private;
alter function public.prepare_phase4_batch(bigint[]) set schema outreach_private;
alter function public.get_phase4_batch(text) set schema outreach_private;
alter function public.confirm_phase4_action(uuid, text) set schema outreach_private;
alter function public.skip_phase4_action(uuid, text, text) set schema outreach_private;

revoke all on function outreach_private.refresh_outreach_relationship_tasks() from public, anon;
revoke all on function outreach_private.record_connection_reconciliation(uuid, text, text, text, text, timestamptz) from public, anon;
revoke all on function outreach_private.prepare_phase4_batch(bigint[]) from public, anon;
revoke all on function outreach_private.get_phase4_batch(text) from public, anon;
revoke all on function outreach_private.confirm_phase4_action(uuid, text) from public, anon;
revoke all on function outreach_private.skip_phase4_action(uuid, text, text) from public, anon;
grant execute on function outreach_private.refresh_outreach_relationship_tasks(),
  outreach_private.record_connection_reconciliation(uuid, text, text, text, text, timestamptz),
  outreach_private.prepare_phase4_batch(bigint[]), outreach_private.get_phase4_batch(text),
  outreach_private.confirm_phase4_action(uuid, text), outreach_private.skip_phase4_action(uuid, text, text)
  to authenticated;
grant execute on function outreach_private.refresh_outreach_relationship_tasks(),
  outreach_private.record_connection_reconciliation(uuid, text, text, text, text, timestamptz)
  to service_role;

create function public.refresh_outreach_relationship_tasks()
returns table (follow_ups_created integer, withdrawals_created integer)
language sql
security invoker
set search_path = ''
as $$ select * from outreach_private.refresh_outreach_relationship_tasks() $$;

create function public.record_connection_reconciliation(
  p_contact_id uuid, p_observed_state text, p_evidence_source text,
  p_external_evidence_key text, p_evidence_summary text,
  p_observed_at timestamptz default now()
)
returns table (event_id bigint, contact_status text, task_id bigint, duplicate_signal boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from outreach_private.record_connection_reconciliation(
    p_contact_id, p_observed_state, p_evidence_source, p_external_evidence_key,
    p_evidence_summary, p_observed_at
  )
$$;

create function public.prepare_phase4_batch(p_task_ids bigint[])
returns table (batch_id uuid, batch_code text, action_type text, selected_count smallint, created_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from outreach_private.prepare_phase4_batch(p_task_ids) $$;

create function public.get_phase4_batch(p_batch_code text default null)
returns table (
  batch_id uuid, batch_code text, batch_status text, action_type text, selected_count smallint,
  session_id uuid, sequence_no smallint, task_id bigint, contact_id uuid, full_name text,
  employer text, current_title text, profile_url text, message_text text, session_status text
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from outreach_private.get_phase4_batch(p_batch_code) $$;

create function public.confirm_phase4_action(p_session_id uuid, p_confirmation_signal text)
returns table (session_id uuid, contact_id uuid, action_type text, contact_status text, activity_id bigint, completed_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from outreach_private.confirm_phase4_action(p_session_id, p_confirmation_signal) $$;

create function public.skip_phase4_action(p_session_id uuid, p_skip_reason text, p_evidence text)
returns table (session_id uuid, contact_id uuid, action_type text, session_status text, skipped_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from outreach_private.skip_phase4_action(p_session_id, p_skip_reason, p_evidence) $$;

revoke all on function public.refresh_outreach_relationship_tasks() from public, anon;
revoke all on function public.record_connection_reconciliation(uuid, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.prepare_phase4_batch(bigint[]) from public, anon;
revoke all on function public.get_phase4_batch(text) from public, anon;
revoke all on function public.confirm_phase4_action(uuid, text) from public, anon;
revoke all on function public.skip_phase4_action(uuid, text, text) from public, anon;
grant execute on function public.refresh_outreach_relationship_tasks(),
  public.record_connection_reconciliation(uuid, text, text, text, text, timestamptz),
  public.prepare_phase4_batch(bigint[]), public.get_phase4_batch(text),
  public.confirm_phase4_action(uuid, text), public.skip_phase4_action(uuid, text, text)
  to authenticated;
grant execute on function public.refresh_outreach_relationship_tasks(),
  public.record_connection_reconciliation(uuid, text, text, text, text, timestamptz)
  to service_role;

create index if not exists outreach_phase4_sessions_contact_idx on public.outreach_phase4_sessions(contact_id);
create index if not exists outreach_phase4_sessions_requested_by_idx on public.outreach_phase4_sessions(requested_by);
create index if not exists outreach_phase4_sessions_task_idx on public.outreach_phase4_sessions(task_id);
create index if not exists outreach_reconciliation_recorded_by_idx on public.outreach_reconciliation_events(recorded_by);
create index if not exists outreach_relationship_tasks_recommendation_idx on public.outreach_relationship_tasks(recommendation_id);
create index if not exists outreach_relationship_tasks_source_event_idx on public.outreach_relationship_tasks(source_event_id);
create index if not exists outreach_discovery_duplicates_contact_idx on public.outreach_discovery_duplicates(canonical_contact_id);

comment on schema outreach_private is 'Privileged Phase 4 implementations; not exposed through the Data API.';
