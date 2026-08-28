-- Run against a disposable database or inside a rolled-back transaction.
-- Substitute an allowlisted Auth user and untouched recommendation IDs.

begin;

-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', '<allowlisted-user-uuid>', true);

-- 1. Queue two recommendations as one batch. Neither contact changes status.
-- select * from public.prepare_browser_assisted_batch(array[<recommendation-id-1>, <recommendation-id-2>]::bigint[]);
-- select count(*) from public.outreach_assist_sessions where batch_id = '<batch-uuid>' and status = 'prepared';
-- select count(*) from public.outreach_activities where contact_id in ('<contact-uuid-1>', '<contact-uuid-2>') and activity_type = 'request_sent';

-- 2. Load the exact batch by its displayed code and verify sequence order.
-- select sequence_no, full_name, employer, profile_url, message_text
-- from public.get_browser_assisted_batch('<batch-code>') order by sequence_no;

-- 3. Invalid batches are rejected.
-- select * from public.prepare_browser_assisted_batch(array[]::bigint[]);
-- select * from public.prepare_browser_assisted_batch(array[<recommendation-id-1>, <recommendation-id-1>]::bigint[]);

-- 4. Starting a batch still creates no outreach event.
-- select * from public.start_browser_assisted_batch('<batch-uuid>');

-- 5. Only visible success completes one item and records one browser-assisted event.
-- select * from public.confirm_browser_assisted_outreach('<session-uuid>', 'linkedin_invitation_sent_visible');
-- select activity_type, evidence_source, recorded_by from public.outreach_activities where contact_id = '<contact-uuid-1>' order by id desc limit 1;

-- 6. A visible pre-existing relationship is a protected skip, not a failure or send.
-- select * from public.skip_browser_assisted_outreach(
--   '<session-uuid>', 'already_pending', 'LinkedIn displayed Pending before any batch action.'
-- );
-- select status, skip_reason, preflight_evidence
-- from public.outreach_assist_sessions where id = '<session-uuid>';

-- 7. Already-pending and already-connected outcomes synchronize the observed
-- relationship state, while previously_contacted does not infer one.
-- select connection_status from public.outreach_contacts where id = '<contact-uuid-1>';

-- 8. A protected contact cannot be queued again, and no duplicate request_sent
-- activity is created for the same observed state.
-- select * from public.prepare_browser_assisted_batch(array[<recommendation-id-1>]::bigint[]);

-- 9. An authenticated but non-owner user changes zero rows under RLS.
-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', '<non-owner-user-uuid>', true);
-- update public.outreach_assist_sessions set preflight_evidence = 'denied' where id = '<session-uuid>';

rollback;
