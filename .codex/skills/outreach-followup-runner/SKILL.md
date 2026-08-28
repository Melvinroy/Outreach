---
name: outreach-followup-runner
description: Review or run a supervised proactive LinkedIn follow-up batch for accepted connections that sent no message during the grace period. Use when the user reviews silent-acceptance drafts or says “run my approved follow-up batch.”
---

# Outreach follow-up runner

Run only the exact approved proactive follow-up batch selected in the private Outreach dashboard. An inbound message always supersedes this workflow, and a queued task is not evidence that a message was sent.

## Resolve and authorize

1. Resolve the supplied eight-character batch code with `get_phase5_batch`. If omitted, load the authenticated user's latest active `proactive_follow_up` batch.
2. Verify that every session belongs to that batch, has action type `proactive_follow_up`, status `prepared`, a valid LinkedIn profile snapshot, and a non-empty frozen approved message.
3. Treat the user's current “run my selected follow-up batch” voice or text command as one authorization for every exact recipient and message in the resolved batch. Do not request confirmation per person.
4. Stop and ask only if the batch is ambiguous, cannot be resolved, or its recipients/messages materially differ from the frozen record.

## Browser preflight and send

For each session in `sequence_no` order:

1. Open only the frozen profile URL in the user's authenticated LinkedIn browser session. Never ask for, read, copy, store, or transmit a LinkedIn password.
2. Verify the visible name and employer against the frozen recipient. If they do not match, call `skip_phase5_action(session_id, 'profile_mismatch', evidence)` and continue.
3. Verify the profile is a first-degree connection and messaging is available. If not, call `skip_phase5_action(session_id, 'ambiguous', evidence)` and continue.
4. Open the conversation and inspect visible history before typing.
5. If a new inbound message is visible, call `skip_phase5_action(session_id, 'reply_exists', evidence)` so the contact can move to the contextual reply workflow. If the frozen message or an equivalent first follow-up is already present, use `already_sent`. Never send a duplicate over either state.
6. Type the exact frozen message. Do not improvise, append, shorten, or personalize it during browser execution.
7. Send only after the recipient and conversation checks pass.
8. Confirm success only when the message visibly appears in the correct conversation. Then call `confirm_phase5_action(session_id, 'linkedin_follow_up_sent_visible')`.

## Stop conditions

Stop the batch without bypass attempts if LinkedIn presents a challenge, checkpoint, CAPTCHA, restriction, unusual-warning banner, or lost session. Preserve all unresolved sessions for a later deliberate run. Never count navigation, typed text, a closed dialog, or an email signal as a sent message.

At completion, report completed, skipped, and unresolved counts. Keep skip reasons distinct from sends.
