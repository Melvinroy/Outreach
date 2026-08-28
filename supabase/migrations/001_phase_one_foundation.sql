create table if not exists public.oi_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.oi_profiles (
  workspace_id uuid primary key references public.oi_workspaces(id) on delete cascade,
  display_name text not null default 'Workspace owner',
  professional_summary text,
  target_roles text[] not null default '{}',
  target_locations text[] not null default '{}',
  target_companies text[] not null default '{}',
  message_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(message_preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oi_companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.oi_workspaces(id) on delete cascade,
  name text not null,
  website_url text,
  industry text,
  headquarters text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.oi_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.oi_workspaces(id) on delete cascade,
  company_id uuid references public.oi_companies(id) on delete set null,
  external_id text,
  title text not null,
  location text,
  job_url text not null,
  posting_date date,
  status text not null default 'active' check (status in ('active','closed','expired','unknown')),
  source text not null default 'manual',
  source_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(source_evidence) = 'object'),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, job_url)
);

create table if not exists public.oi_people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.oi_workspaces(id) on delete cascade,
  company_id uuid references public.oi_companies(id) on delete set null,
  full_name text not null,
  company_name text,
  current_title text,
  location text,
  profile_url text,
  relationship_status text not null default 'recommended' check (relationship_status in ('recommended','approved','skipped','connection_attempted','connection_pending','connection_accepted','connection_expired','follow_up_due','follow_up_sent','reply_received','meeting_scheduled','closed')),
  first_recommended_at timestamptz,
  last_recommended_at timestamptz,
  source_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(source_evidence) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, profile_url)
);

create table if not exists public.oi_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.oi_workspaces(id) on delete cascade,
  run_date date not null,
  workflow_name text not null default 'outreach_discovery',
  status text not null default 'completed' check (status in ('queued','running','awaiting_review','completed','failed','cancelled')),
  target_hiring_managers smallint not null default 15 check (target_hiring_managers between 0 and 100),
  target_executives smallint not null default 15 check (target_executives between 0 and 100),
  actual_hiring_managers smallint not null default 0 check (actual_hiring_managers between 0 and 100),
  actual_executives smallint not null default 0 check (actual_executives between 0 and 100),
  company_count smallint not null default 0 check (company_count >= 0),
  run_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(run_metadata) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.oi_recommendations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.oi_workspaces(id) on delete cascade,
  run_id uuid references public.oi_workflow_runs(id) on delete set null,
  person_id uuid not null references public.oi_people(id) on delete cascade,
  job_id uuid references public.oi_jobs(id) on delete set null,
  track text not null check (track in ('hiring_manager','executive')),
  priority smallint not null check (priority between 1 and 100),
  opening_title text,
  seniority_band text,
  estimated_levels_above smallint check (estimated_levels_above between 0 and 12),
  fit_assessment text,
  genuine_gap text,
  personalized_message text check (personalized_message is null or char_length(personalized_message) <= 300),
  verification_status text not null default 'verified' check (verification_status in ('unverified','partially_verified','verified','rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, run_id, person_id, track)
);

create table if not exists public.oi_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.oi_workspaces(id) on delete cascade,
  person_id uuid not null references public.oi_people(id) on delete cascade,
  recommendation_id uuid references public.oi_recommendations(id) on delete set null,
  message_type text not null check (message_type in ('connection_note','first_follow_up','second_follow_up','reply','other')),
  body text not null,
  status text not null default 'drafted' check (status in ('drafted','approved','sent','failed','cancelled')),
  sent_at timestamptz,
  delivery_source text check (delivery_source is null or delivery_source in ('manual','browser_assisted','platform_api')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oi_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.oi_workspaces(id) on delete cascade,
  person_id uuid not null references public.oi_people(id) on delete cascade,
  recommendation_id uuid references public.oi_recommendations(id) on delete set null,
  message_id uuid references public.oi_messages(id) on delete set null,
  event_type text not null check (event_type in ('recommended','approved','skipped','connection_attempted','connection_pending','connection_accepted','connection_expired','follow_up_due','follow_up_sent','reply_received','meeting_scheduled','closed','note')),
  event_at timestamptz not null default now(),
  evidence_source text not null default 'manual' check (evidence_source in ('system','manual','browser_assisted','platform_api','import')),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists oi_workspaces_owner_idx on public.oi_workspaces(owner_id);
create index if not exists oi_companies_workspace_idx on public.oi_companies(workspace_id);
create index if not exists oi_jobs_workspace_status_idx on public.oi_jobs(workspace_id, status, posting_date desc);
create index if not exists oi_jobs_company_idx on public.oi_jobs(company_id);
create index if not exists oi_people_workspace_status_idx on public.oi_people(workspace_id, relationship_status, last_recommended_at desc);
create index if not exists oi_people_company_idx on public.oi_people(company_id);
create index if not exists oi_runs_workspace_date_idx on public.oi_workflow_runs(workspace_id, run_date desc);
create index if not exists oi_recommendations_workspace_track_idx on public.oi_recommendations(workspace_id, track, verified_at desc);
create index if not exists oi_recommendations_run_idx on public.oi_recommendations(run_id);
create index if not exists oi_recommendations_person_idx on public.oi_recommendations(person_id);
create index if not exists oi_recommendations_job_idx on public.oi_recommendations(job_id);
create index if not exists oi_messages_workspace_status_idx on public.oi_messages(workspace_id, status, created_at desc);
create index if not exists oi_messages_person_idx on public.oi_messages(person_id);
create index if not exists oi_messages_recommendation_idx on public.oi_messages(recommendation_id);
create index if not exists oi_events_workspace_type_date_idx on public.oi_events(workspace_id, event_type, event_at desc);
create index if not exists oi_events_person_date_idx on public.oi_events(person_id, event_at desc);
create index if not exists oi_events_recommendation_idx on public.oi_events(recommendation_id);
create index if not exists oi_events_message_idx on public.oi_events(message_id);
create index if not exists oi_events_actor_idx on public.oi_events(actor_user_id);

alter table public.oi_workspaces enable row level security;
alter table public.oi_profiles enable row level security;
alter table public.oi_companies enable row level security;
alter table public.oi_jobs enable row level security;
alter table public.oi_people enable row level security;
alter table public.oi_workflow_runs enable row level security;
alter table public.oi_recommendations enable row level security;
alter table public.oi_messages enable row level security;
alter table public.oi_events enable row level security;

create policy "Owners manage their workspaces" on public.oi_workspaces for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners manage workspace profiles" on public.oi_profiles for all to authenticated using (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))) with check (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "Owners manage workspace companies" on public.oi_companies for all to authenticated using (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))) with check (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "Owners manage workspace jobs" on public.oi_jobs for all to authenticated using (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))) with check (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "Owners manage workspace people" on public.oi_people for all to authenticated using (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))) with check (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "Owners manage workspace workflow runs" on public.oi_workflow_runs for all to authenticated using (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))) with check (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "Owners manage workspace recommendations" on public.oi_recommendations for all to authenticated using (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))) with check (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "Owners manage workspace messages" on public.oi_messages for all to authenticated using (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid()))) with check (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "Owners read workspace events" on public.oi_events for select to authenticated using (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "Owners append workspace events" on public.oi_events for insert to authenticated with check (exists (select 1 from public.oi_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));

revoke all on public.oi_workspaces, public.oi_profiles, public.oi_companies, public.oi_jobs, public.oi_people, public.oi_workflow_runs, public.oi_recommendations, public.oi_messages, public.oi_events from anon;
grant select, insert, update, delete on public.oi_workspaces, public.oi_profiles, public.oi_companies, public.oi_jobs, public.oi_people, public.oi_workflow_runs, public.oi_recommendations, public.oi_messages to authenticated;
grant select, insert on public.oi_events to authenticated;

comment on table public.oi_events is 'Append-only relationship evidence. Dashboard funnel metrics are derived from explicit events rather than inferred contact counts.';
comment on table public.oi_workspaces is 'Owner-scoped workspace for a generic Outreach Intelligence installation.';
