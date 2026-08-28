# LinkedIn Acceptance Sync template

Create this as a ChatGPT Gmail event-triggered task after Gmail and the user's Supabase project are connected. Replace every `{{...}}` placeholder before activation.

## Trigger

- Gmail event: new incoming message
- Exact sender: `invitations@linkedin.com`

## Prompt

For every triggering Gmail event, fetch and read the actual new message. Proceed only when the sender is exactly `invitations@linkedin.com` and the subject unambiguously states that a named person accepted the user's LinkedIn invitation.

Extract the person's full name and LinkedIn profile URL when present. In the user's Supabase project `{{SUPABASE_PROJECT_ID}}`, find exactly one Outreach contact using the normalized LinkedIn identity first. Without a usable profile URL, require an exact normalized full-name match and use employer or title evidence only to disambiguate. Never guess and never update multiple contacts.

For one exact match, call `public.record_connection_reconciliation` with state `accepted`, source `gmail_signal`, an idempotent source reference containing the Gmail message ID, concise subject evidence, and the email timestamp. Confirm that the accepted relationship and follow-up task were created or preserved.

For no unique match, make no database change and report the person and subject for manual review. Ignore job alerts, security emails, recommendations, reminders, and unrelated mail. Never send a LinkedIn request, LinkedIn message, email, résumé, application, or follow-up automatically.
