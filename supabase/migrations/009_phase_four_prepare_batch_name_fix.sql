-- Qualify action_type because it is also an output-column name in PL/pgSQL.
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

revoke all on function public.prepare_phase4_batch(bigint[]) from public, anon;
grant execute on function public.prepare_phase4_batch(bigint[]) to authenticated;
