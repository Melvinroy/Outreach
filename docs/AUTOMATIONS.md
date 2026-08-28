# ChatGPT automation setup

Event-triggered tasks are user-owned ChatGPT configuration. They are not created by a GitHub fork and cannot inherit another person's Gmail or Supabase authorization.

## Acceptance detection

1. Connect the user's Gmail and Supabase apps in ChatGPT.
2. Copy `automations/linkedin-acceptance-sync.md`.
3. Replace `{{SUPABASE_PROJECT_ID}}` with the user's project ID.
4. Create a Gmail event-triggered task using the exact sender filter in the template.
5. Test one known notification and verify an exact contact match before leaving it enabled.

## Incoming-message detection

Repeat the process with `automations/linkedin-message-sync.md`, configuring both exact LinkedIn sender addresses in one event-triggered task.

## Required boundaries

- Gmail events only wake the task; the task fetches and verifies the actual email.
- A Gmail excerpt never substitutes for the visible LinkedIn conversation.
- Exact or uniquely disambiguated identity is required before a write.
- External Gmail message IDs provide idempotency.
- No Gmail event sends a LinkedIn message or email automatically.
- Review the first few runs in ChatGPT Scheduled and disable the task if matching becomes unreliable.

Availability depends on the user's ChatGPT plan and workspace settings. Supported app-event tasks run in ChatGPT cloud and do not require the dashboard or laptop to stay open.
