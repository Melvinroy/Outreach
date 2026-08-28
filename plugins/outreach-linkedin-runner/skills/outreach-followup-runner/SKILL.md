---
name: outreach-followup-runner
description: Run an approved proactive LinkedIn follow-up batch for accepted connections that remained silent through the configured grace period.
---

# Outreach proactive follow-up runner

Run only exact approved `proactive_follow_up` sessions from the current user's configured Outreach database.

For every prepared session, verify the frozen profile, first-degree relationship, and visible conversation before typing. Use `skip_phase5_action` for profile mismatch, ambiguity, an existing equivalent follow-up, or a newly visible inbound message. A new inbound message supersedes the proactive workflow and must route to contextual reply review.

Type the exact approved frozen message without improvising. Record completion only after it visibly appears in the correct LinkedIn conversation. The user's command authorizes the exact batch once; do not ask per recipient.

Never access or persist credentials. Stop on CAPTCHA, checkpoint, restriction, warning, lost session, or identity uncertainty, preserving unresolved sessions for a later deliberate run.
