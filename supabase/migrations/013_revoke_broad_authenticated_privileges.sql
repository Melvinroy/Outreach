-- Phase 6 hardening: RLS does not protect TRUNCATE, REFERENCES, or TRIGGER.
-- Preserve the workflow's existing row and column DML grants while removing
-- these unnecessary table-wide privileges from browser-authenticated users.

revoke truncate, references, trigger
on table public.outreach_assist_batches,
         public.outreach_assist_sessions,
         public.outreach_user_settings
from authenticated;

