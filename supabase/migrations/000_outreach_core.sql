-- Canonical Outreach core required by every fresh installation.
-- This migration contains schema only: no user, contact, company, project,
-- credential, or deployment values belong in a reusable installation.

create table if not exists public.outreach_runs (
  id uuid primary key default gen_random_uuid(),
  automation_name text not null default 'Outreach Discovery',
  run_date date not null,
  generated_at_sgt timestamptz not null,
  target_hiring_managers smallint not null default 15 check (target_hiring_managers > 0),
  target_executives smallint not null default 15 check (target_executives > 0),
  actual_hiring_managers smallint not null default 0 check (actual_hiring_managers >= 0),
  actual_executives smallint not null default 0 check (actual_executives >= 0),
  company_count smallint not null default 0 check (company_count >= 0),
  raw_report_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_name, run_date)
);

create table if not exists public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  employer text not null,
  current_title text,
  location text,
  linkedin_profile_url text not null unique,
  connection_status text not null default 'not_contacted' check (
    connection_status in (
      'not_contacted', 'request_sent', 'connected', 'messaged', 'replied',
      'meeting_scheduled', 'referred', 'withdrawn', 'closed'
    )
  ),
  first_recommended_date date not null,
  last_recommended_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (full_name, employer)
);

create table if not exists public.outreach_recommendations (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.outreach_runs(id) on delete cascade,
  contact_id uuid not null references public.outreach_contacts(id) on delete restrict,
  track text not null check (track in ('hiring_manager', 'executive')),
  priority smallint not null check (priority between 1 and 15),
  relationship_to_opening text,
  seniority_band text,
  estimated_levels_above smallint check (estimated_levels_above between 0 and 8),
  opening_title text,
  experience_requirement text,
  posting_date date,
  fit_assessment text not null,
  genuine_gap text,
  hiring_post_url text,
  active_job_url text,
  personalized_message text not null,
  message_character_count smallint not null check (message_character_count between 1 and 300),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (run_id, contact_id),
  unique (run_id, track, priority)
);

create table if not exists public.outreach_activities (
  id bigint generated always as identity primary key,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  activity_type text not null check (
    activity_type in (
      'recommended', 'request_sent', 'connected', 'message_sent',
      'reply_received', 'follow_up', 'meeting_scheduled', 'referral',
      'closed', 'note'
    )
  ),
  activity_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.outreach_app_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists outreach_runs_run_date_idx on public.outreach_runs(run_date desc);
create index if not exists outreach_contacts_status_idx on public.outreach_contacts(connection_status);
create index if not exists outreach_contacts_employer_idx on public.outreach_contacts(employer);
create index if not exists outreach_recommendations_run_idx on public.outreach_recommendations(run_id);
create index if not exists outreach_recommendations_contact_idx on public.outreach_recommendations(contact_id);
create index if not exists outreach_recommendations_track_idx on public.outreach_recommendations(track, priority);
create index if not exists outreach_activities_contact_time_idx on public.outreach_activities(contact_id, activity_at desc);

alter table public.outreach_runs enable row level security;
alter table public.outreach_contacts enable row level security;
alter table public.outreach_recommendations enable row level security;
alter table public.outreach_activities enable row level security;
alter table public.outreach_app_access enable row level security;

drop policy if exists "Users can read their own access row" on public.outreach_app_access;
create policy "Users can read their own access row" on public.outreach_app_access
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Allowlisted users can read outreach runs" on public.outreach_runs;
create policy "Allowlisted users can read outreach runs" on public.outreach_runs
for select to authenticated using (
  exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid()))
);

drop policy if exists "Allowlisted users can read outreach contacts" on public.outreach_contacts;
create policy "Allowlisted users can read outreach contacts" on public.outreach_contacts
for select to authenticated using (
  exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid()))
);

drop policy if exists "Allowlisted users can read outreach recommendations" on public.outreach_recommendations;
create policy "Allowlisted users can read outreach recommendations" on public.outreach_recommendations
for select to authenticated using (
  exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid()))
);

drop policy if exists "Allowlisted users can read outreach activities" on public.outreach_activities;
create policy "Allowlisted users can read outreach activities" on public.outreach_activities
for select to authenticated using (
  exists (select 1 from public.outreach_app_access a where a.user_id = (select auth.uid()))
);

revoke all on table public.outreach_runs, public.outreach_contacts,
  public.outreach_recommendations, public.outreach_activities,
  public.outreach_app_access from anon, authenticated;

grant select on table public.outreach_runs, public.outreach_contacts,
  public.outreach_recommendations, public.outreach_activities,
  public.outreach_app_access to authenticated;

comment on table public.outreach_app_access is
  'Owner allowlist. A new personal installation can be claimed once through the guarded Phase 6 owner-claim function.';
