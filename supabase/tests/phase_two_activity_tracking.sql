-- Run in a transaction with an allowlisted auth user ID substituted below.
-- The transaction must be rolled back so production outreach state is unchanged.
-- Assertions:
-- 1. The allowlisted user can call record_outreach_activity for an existing contact.
-- 2. The contact status and appended activity agree inside the transaction.
-- 3. ROLLBACK restores the original production state.
-- 4. A non-allowlisted authenticated user receives no writable rows through RLS.

begin;
-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', '<allowlisted-user-uuid>', true);
-- select * from public.record_outreach_activity('<contact-uuid>', 'request_sent', 'Phase 2 RLS test');
-- select connection_status from public.outreach_contacts where id = '<contact-uuid>';
-- select activity_type, evidence_source, recorded_by
-- from public.outreach_activities where contact_id = '<contact-uuid>' order by id desc limit 1;
rollback;
