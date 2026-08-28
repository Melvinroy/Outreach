---
name: outreach-batch-runner
description: Run a supervised user-selected Outreach connection batch with browser computer use. Use for an exact prepared batch; never discover contacts or run unattended bulk outreach.
---

# Outreach connection batch runner

Run only the exact frozen batch selected in the user's Outreach dashboard. Queueing is preparation, not evidence of a send.

## Resolve and authorize

1. Use the Supabase project configured by the current user; never use a project identifier embedded in a skill or example.
2. Resolve the supplied eight-character code, or the authenticated user's latest active connection batch when the command is unambiguous.
3. Load sessions in sequence and verify ownership, recipients, profile snapshots, messages, and prepared status.
4. The current command to run the selected batch authorizes those exact frozen recipients and notes once. Ask only when the batch is ambiguous or differs materially.

## Execute safely

For each prepared session:

1. Check recorded relationship history before opening LinkedIn.
2. Open the frozen profile and verify the visible name and employer.
3. Record a protected skip without opening the composer when LinkedIn unambiguously shows pending, first-degree connection, or prior contact history.
4. Stop the batch on a profile mismatch because the frozen target is unreliable.
5. Otherwise use the exact frozen note, send once, and record completion only after LinkedIn visibly confirms success.
6. Resume after interruptions from the first unresolved session; never repeat completed or skipped sessions.

Never request, read, copy, export, store, or log a LinkedIn password or browser credential. Stop without workaround attempts for a CAPTCHA, identity challenge, invitation limit, restriction, warning, or ambiguous changed send flow. Report completed, protected, failed, and remaining counts separately.
