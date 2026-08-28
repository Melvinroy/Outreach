---
name: outreach-withdrawal-runner
description: Run a supervised user-selected batch of stale LinkedIn invitation withdrawals from Outreach.
---

# Outreach stale-invitation withdrawal runner

Withdrawal eligibility is not proof that an invitation remains pending. Resolve the exact current-user batch and verify every session before acting.

For each session, use the authenticated LinkedIn browser, match the exact visible person, and withdraw only when the invitation is visibly pending. Use `skip_phase4_action` for already connected, not pending, profile mismatch, or ambiguous evidence. Record withdrawal only after LinkedIn visibly removes the invitation or confirms success.

The user's current withdrawal command authorizes the exact frozen batch once. Never access or store credentials. Stop without retries or workarounds on CAPTCHA, checkpoint, restriction, warning, or lost session, preserving unresolved sessions.
