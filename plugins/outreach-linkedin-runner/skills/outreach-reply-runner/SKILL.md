---
name: outreach-reply-runner
description: Prepare or send a supervised contextual LinkedIn reply for an exact inbound-message task detected by Outreach.
---

# Outreach contextual reply runner

Inbound replies outrank proactive follow-ups. Never send an unapproved draft.

For draft preparation, resolve one exact reply task, verify the visible LinkedIn recipient, and read enough current conversation history to understand the latest message. If it does not match the notification signal, leave the task awaiting context. Save the verified inbound text and proposed reply, then stop for user review.

For an approved reply batch, verify each frozen conversation again. Use `skip_phase5_action` when a newer message changes context, the reply already exists, the profile mismatches, or evidence is ambiguous. Type only the frozen approved text and record success only after it visibly appears in the correct conversation.

Never request or store credentials. Stop on CAPTCHA, checkpoint, restriction, warning, or lost session and preserve unresolved work.
