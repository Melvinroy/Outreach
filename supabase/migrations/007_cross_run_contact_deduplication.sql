-- Cross-run identity guardrails for scheduled discovery.
-- Raw LinkedIn URLs vary by scheme, host, slash and query parameters, so the
-- stable /in/{slug} identity is the primary key. Name + employer is used only
-- when a usable LinkedIn identity is unavailable.

create or replace function public.normalize_linkedin_identity(p_profile_url text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when lower(btrim(p_profile_url)) ~ 'linkedin\.com/in/[^/?#]+'
      then 'linkedin:' || lower(substring(lower(btrim(p_profile_url)) from 'linkedin\.com/in/([^/?#]+)'))
    else null
  end
$$;

create or replace function public.normalize_name_employer_identity(p_full_name text, p_employer text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(regexp_replace(btrim(p_full_name), '\s+', ' ', 'g')) || '|' ||
         lower(regexp_replace(btrim(p_employer), '\s+', ' ', 'g'))
$$;

alter table public.outreach_contacts
  add column if not exists linkedin_identity_key text
    generated always as (public.normalize_linkedin_identity(linkedin_profile_url)) stored,
  add column if not exists name_employer_identity_key text
    generated always as (public.normalize_name_employer_identity(full_name, employer)) stored;

create unique index if not exists outreach_contacts_linkedin_identity_key_uq
  on public.outreach_contacts(linkedin_identity_key)
  where linkedin_identity_key is not null;

create unique index if not exists outreach_contacts_fallback_identity_key_uq
  on public.outreach_contacts(name_employer_identity_key)
  where linkedin_identity_key is null;

create table if not exists public.outreach_discovery_duplicates (
  id bigint generated always as identity primary key,
  run_id uuid references public.outreach_runs(id) on delete cascade,
  canonical_contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  duplicate_reason text not null check (
    duplicate_reason in ('linkedin_identity', 'name_employer_identity')
  ),
  observed_full_name text not null,
  observed_employer text not null,
  observed_profile_url text,
  source text not null default 'scheduled_discovery' check (
    source in ('scheduled_discovery', 'manual_import', 'api_import')
  ),
  detected_at timestamptz not null default now()
);

comment on table public.outreach_discovery_duplicates is
  'Audit log of candidates removed because they match a historical canonical contact.';

create unique index if not exists outreach_discovery_duplicates_run_contact_uq
  on public.outreach_discovery_duplicates(run_id, canonical_contact_id)
  where run_id is not null;

create index if not exists outreach_discovery_duplicates_detected_idx
  on public.outreach_discovery_duplicates(detected_at desc, duplicate_reason);

alter table public.outreach_discovery_duplicates enable row level security;

drop policy if exists "Allowlisted users can read discovery duplicate audit" on public.outreach_discovery_duplicates;
create policy "Allowlisted users can read discovery duplicate audit"
on public.outreach_discovery_duplicates for select to authenticated
using (
  exists (
    select 1 from public.outreach_app_access a
    where a.user_id = (select auth.uid())
  )
);

revoke all on table public.outreach_discovery_duplicates from public, anon, authenticated;
grant select on table public.outreach_discovery_duplicates to authenticated;
grant insert on table public.outreach_discovery_duplicates to service_role;
grant usage, select on sequence public.outreach_discovery_duplicates_id_seq to service_role;

revoke all on function public.normalize_linkedin_identity(text) from public, anon;
revoke all on function public.normalize_name_employer_identity(text, text) from public, anon;
grant execute on function public.normalize_linkedin_identity(text) to authenticated, service_role;
grant execute on function public.normalize_name_employer_identity(text, text) to authenticated, service_role;

comment on function public.normalize_linkedin_identity(text) is
  'Returns a stable lowercase LinkedIn /in/ slug key, ignoring scheme, host prefix, trailing slash, query and fragment.';
comment on function public.normalize_name_employer_identity(text, text) is
  'Returns a normalized name-plus-employer fallback identity for candidates without a usable LinkedIn profile key.';
