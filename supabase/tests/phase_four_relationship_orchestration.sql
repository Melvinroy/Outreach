-- Run against production only inside this rolled-back transaction.
-- Substitute an allowlisted Auth user, a pending contact and a connected contact.

begin;

-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', '<allowlisted-user-uuid>', true);

-- 1. Replaying one Gmail message ID returns duplicate_signal=true and creates
-- exactly one reconciliation event, connected activity and follow-up task.
-- select * from public.record_connection_reconciliation(
--   '<pending-contact-uuid>', 'accepted', 'gmail_signal', 'gmail:<message-id>',
--   'LinkedIn acceptance email matched exact profile identity.', now()
-- );
-- select * from public.record_connection_reconciliation(
--   '<pending-contact-uuid>', 'accepted', 'gmail_signal', 'gmail:<message-id>',
--   'Replay of the same Gmail message.', now()
-- );

-- 2. Ambiguous evidence creates a review checkpoint and leaves contact status unchanged.
-- select * from public.record_connection_reconciliation(
--   '<pending-contact-uuid>', 'ambiguous', 'browser_assisted', null,
--   'Two LinkedIn profiles share the same visible name.', now()
-- );

-- 3. Refresh creates a withdrawal task only when request_sent is at least 14 days old.
-- select * from public.refresh_outreach_relationship_tasks();

-- 4. A follow-up batch and withdrawal batch cannot mix task IDs.
-- select * from public.prepare_phase4_batch(array[<follow-up-task-id>, <withdrawal-task-id>]::bigint[]);

-- 5. Confirmation requires the action-specific visible signal and duplicate
-- confirmation is rejected.
-- select * from public.confirm_phase4_action('<follow-up-session-uuid>', 'linkedin_message_sent_visible');
-- select * from public.confirm_phase4_action('<follow-up-session-uuid>', 'linkedin_message_sent_visible');

-- 6. A non-allowlisted authenticated user sees zero task/batch/workflow rows under RLS.
-- select set_config('request.jwt.claim.sub', '<non-allowlisted-user-uuid>', true);
-- select count(*) from public.outreach_relationship_tasks;
-- select count(*) from public.outreach_phase4_batches;
-- select count(*) from public.outreach_phase4_workflow_runs;

rollback;
