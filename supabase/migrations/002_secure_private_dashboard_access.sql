-- The dashboard is read-only in Phase 1. RLS decides which authenticated users
-- can read; table privileges must not allow anonymous access or allowlist edits.
revoke all on table public.outreach_app_access from anon;
revoke all on table public.outreach_app_access from authenticated;
grant select on table public.outreach_app_access to authenticated;

revoke all on table
  public.outreach_runs,
  public.outreach_contacts,
  public.outreach_recommendations,
  public.outreach_activities
from anon;

revoke insert, update, delete, truncate, references, trigger on table
  public.outreach_runs,
  public.outreach_contacts,
  public.outreach_recommendations,
  public.outreach_activities
from authenticated;

grant select on table
  public.outreach_runs,
  public.outreach_contacts,
  public.outreach_recommendations,
  public.outreach_activities
to authenticated;

comment on table public.outreach_app_access is
  'Explicit allowlist for authenticated users permitted to read the private Outreach dashboard. Membership is administered outside the public client.';
