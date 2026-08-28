-- Run against a disposable database or inside a rolled-back transaction.
-- Substitute an allowlisted Auth user and an untouched contact/recommendation.
-- The test verifies that preparation is not counted as outreach and that only
-- a visible-confirmation token completes the session atomically.

begin;

-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', '<allowlisted-user-uuid>', true);

-- 1. Prepare: creates a session but leaves the contact and funnel unchanged.
-- select * from public.prepare_browser_assisted_outreach('<contact-uuid>', <recommendation-id>);
-- select connection_status from public.outreach_contacts where id = '<contact-uuid>';
-- select count(*) from public.outreach_activities
-- where contact_id = '<contact-uuid>' and activity_type = 'request_sent';

-- 2. Reject an invalid success signal.
-- select * from public.confirm_browser_assisted_outreach('<session-uuid>', 'profile_opened');

-- 3. Confirm: one completed session, one browser-assisted event, one status change.
-- select * from public.confirm_browser_assisted_outreach(
--   '<session-uuid>', 'linkedin_invitation_sent_visible'
-- );
-- select status, confirmation_signal, completed_at
-- from public.outreach_assist_sessions where id = '<session-uuid>';
-- select connection_status from public.outreach_contacts where id = '<contact-uuid>';
-- select activity_type, evidence_source, recorded_by
-- from public.outreach_activities where contact_id = '<contact-uuid>' order by id desc limit 1;

rollback;
