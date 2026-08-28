---
name: outreach-withdrawal-runner
description: Run a supervised, user-selected LinkedIn stale-invitation withdrawal batch from Outreach. Use when the user says “withdraw my selected stale invitations,” asks Codex to cancel the selected old pending requests, or supplies a Phase 4 withdrawal batch code. The single command authorizes the exact frozen batch; do not ask for approval per invitation.
---

# Outreach stale-invitation withdrawal runner

Withdraw only the exact frozen batch selected in the private Outreach dashboard. A 14-day task is eligibility for review, not proof that the invitation is still pending.

## Resolve and authorize

1. Resolve the supplied eight-character batch code with `get_phase4_batch`. If omitted, load the authenticated user's latest active `withdraw_invitation` batch.
2. Verify that every session belongs to the batch, has action type `withdraw_invitation`, status `prepared`, and a valid frozen LinkedIn profile URL.
3. Treat the user's current “withdraw my selected stale invitations” command as one authorization for every exact invitation in that batch. Do not request approval per invitation.

## Browser verification and withdrawal

For each session in `sequence_no` order:

1. Use the user's authenticated LinkedIn browser session. Never ask for, read, copy, store, or transmit a LinkedIn password.
2. Open LinkedIn's sent-invitations management view or the frozen profile, and match the exact visible person to the frozen name/profile.
3. Withdraw only when LinkedIn visibly shows that the invitation is still pending.
4. If the person is already connected, do not withdraw. Call `skip_phase4_action(session_id, 'already_connected', evidence)` and reconcile the connection separately so a follow-up can be created.
5. If no pending invitation exists, call `skip_phase4_action(session_id, 'not_pending', evidence)`. For a mismatched identity use `profile_mismatch`; for uncertain evidence use `ambiguous`.
6. After clicking Withdraw, confirm that LinkedIn visibly removes the invitation or shows a withdrawal success state. Only then call `confirm_phase4_action(session_id, 'linkedin_invitation_withdrawn_visible')`.

## Stop conditions

Stop without workarounds on CAPTCHA, challenge, checkpoint, restriction, or loss of the authenticated session. Do not repeatedly retry a withdrawal. Preserve unresolved sessions and report completed, skipped, and unresolved counts separately.
