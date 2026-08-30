-- Recoverable do-not-contact storage for recommendations the owner rejects.
-- Discarded contacts stay out of outreach queues and cannot enter Codex batches.

create table if not exists public.outreach_discarded_contacts (
  contact_id uuid primary key references public.outreach_contacts(id) on delete cascade,
  discarded_by uuid not null references auth.users(id) on delete cascade,
  discarded_at timestamptz not null default now()
);

create index if not exists outreach_discarded_contacts_owner_time_idx
  on public.outreach_discarded_contacts(discarded_by, discarded_at desc);

alter table public.outreach_discarded_contacts enable row level security;

drop policy if exists "Owners can read their discarded contacts" on public.outreach_discarded_contacts;
create policy "Owners can read their discarded contacts"
on public.outreach_discarded_contacts for select to authenticated
using (
  discarded_by = (select auth.uid())
  and exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

revoke all on table public.outreach_discarded_contacts from public, anon, authenticated;
grant select on table public.outreach_discarded_contacts to authenticated;

create or replace function outreach_private.set_outreach_contact_discarded(
  p_contact_id uuid,
  p_discarded boolean
)
returns table (contact_id uuid, discarded_at timestamptz, discarded_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_contact_status text;
  v_discarded_at timestamptz := now();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.outreach_app_access a where a.user_id = v_user_id) then
    raise exception 'Owner access required';
  end if;

  select c.connection_status into v_contact_status
  from public.outreach_contacts c
  where c.id = p_contact_id
  for update;

  if not found then raise exception 'Contact not found'; end if;

  if p_discarded then
    if v_contact_status <> 'not_contacted' then
      raise exception 'Only unreached contacts can be discarded';
    end if;

    insert into public.outreach_discarded_contacts(contact_id, discarded_by, discarded_at)
    values (p_contact_id, v_user_id, v_discarded_at)
    on conflict (contact_id) do update
    set discarded_by = excluded.discarded_by,
        discarded_at = excluded.discarded_at;

    -- If the person was frozen into an unfinished batch, cancel the whole batch.
    -- The owner can safely create a new batch from the remaining visible contacts.
    update public.outreach_assist_sessions s
    set status = 'cancelled',
        failure_reason = 'Batch cleared because a selected contact was discarded.',
        updated_at = v_discarded_at
    where s.requested_by = v_user_id
      and s.status = 'prepared'
      and s.batch_id in (
        select affected.batch_id
        from public.outreach_assist_sessions affected
        join public.outreach_assist_batches b on b.id = affected.batch_id
        where affected.contact_id = p_contact_id
          and b.requested_by = v_user_id
          and b.status in ('ready', 'running', 'awaiting_confirmation')
      );

    update public.outreach_assist_batches b
    set status = 'cancelled', completed_at = v_discarded_at, updated_at = v_discarded_at
    where b.requested_by = v_user_id
      and b.status in ('ready', 'running', 'awaiting_confirmation')
      and exists (
        select 1 from public.outreach_assist_sessions s
        where s.batch_id = b.id and s.contact_id = p_contact_id
      );
  else
    delete from public.outreach_discarded_contacts d
    where d.contact_id = p_contact_id and d.discarded_by = v_user_id;
  end if;

  return query select p_contact_id, v_discarded_at, v_user_id;
end;
$$;

revoke all on function outreach_private.set_outreach_contact_discarded(uuid, boolean) from public, anon;
grant execute on function outreach_private.set_outreach_contact_discarded(uuid, boolean) to authenticated;

create or replace function public.set_outreach_contact_discarded(
  p_contact_id uuid,
  p_discarded boolean
)
returns table (contact_id uuid, discarded_at timestamptz, discarded_by uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from outreach_private.set_outreach_contact_discarded(p_contact_id, p_discarded)
$$;

revoke all on function public.set_outreach_contact_discarded(uuid, boolean) from public, anon;
grant execute on function public.set_outreach_contact_discarded(uuid, boolean) to authenticated;

create or replace function outreach_private.reject_discarded_assist_session()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.outreach_discarded_contacts d
    where d.contact_id = new.contact_id and d.discarded_by = new.requested_by
  ) then
    raise exception 'Discarded contacts cannot be added to an outreach batch';
  end if;
  return new;
end;
$$;

revoke all on function outreach_private.reject_discarded_assist_session() from public, anon;

drop trigger if exists reject_discarded_assist_session on public.outreach_assist_sessions;
create trigger reject_discarded_assist_session
before insert or update of contact_id, requested_by on public.outreach_assist_sessions
for each row execute function outreach_private.reject_discarded_assist_session();

comment on table public.outreach_discarded_contacts is
  'Owner-controlled, recoverable do-not-contact list. Rows suppress contacts from discovery queues and assisted outreach.';
comment on function public.set_outreach_contact_discarded(uuid, boolean) is
  'Moves an unreached contact into or out of the recoverable discarded list and clears any unsafe unfinished batch.';
