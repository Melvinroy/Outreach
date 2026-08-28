---
name: outreach-reply-runner
description: Prepare or send a supervised LinkedIn reply for inbound messages detected by Outreach. Use when the user asks to prepare a reply for a contact, review an inbound LinkedIn message, or run an approved reply batch.
---

# Outreach reply runner

Inbound replies outrank proactive follow-ups. Never send an unapproved draft.

## Prepare a contextual reply

1. Resolve the exact `reply` task from `outreach_conversation_tasks`. Ask only when the contact or task is ambiguous.
2. Open the frozen LinkedIn profile in the user's authenticated browser session. Never request, read, copy, store, or transmit a LinkedIn password.
3. Verify the visible name and employer, then open the conversation and read the latest inbound message plus enough history to understand it.
4. If the visible conversation does not match the Gmail signal, leave the task in `context_required` and report the mismatch.
5. Draft a concise, natural reply that directly addresses the request. For a resume or application-link request, acknowledge the request and include only the action the user can actually complete.
6. Save the verified inbound text and draft with `save_phase5_draft`. Stop before sending so the user can review or edit the draft.

## Send an approved reply batch

1. Resolve the exact code with `get_phase5_batch`; when omitted, use the authenticated user's latest active `reply` batch.
2. Verify every session is `prepared`, has action type `reply`, and contains the frozen approved message.
3. The user's current command authorizes the exact approved messages in that batch. Do not request approval again per person.
4. Open each frozen profile and conversation in sequence. Verify identity and confirm the latest inbound message still matches the frozen context.
5. If a newer message changes the conversation, call `skip_phase5_action(session_id, 'newer_message', evidence)` and do not send the stale draft.
6. If the reply or an equivalent message is already present, use `already_sent`. For profile mismatch or uncertainty, use `profile_mismatch` or `ambiguous`.
7. Type the exact frozen approved message without improvising. Confirm success only when it visibly appears in the correct conversation, then call `confirm_phase5_action(session_id, 'linkedin_reply_sent_visible')`.

Stop the run on a CAPTCHA, checkpoint, account restriction, unusual-warning banner, or lost session. Preserve unresolved sessions and report completed, skipped, and unresolved counts separately.
