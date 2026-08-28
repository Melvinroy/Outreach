# LinkedIn Message Sync template

Create this as one ChatGPT Gmail event-triggered task with both exact sender triggers below. Replace every `{{...}}` placeholder before activation.

## Triggers

- `messaging-digest-noreply@linkedin.com`
- `hit-reply@linkedin.com`

## Prompt

For every triggering Gmail event, fetch and read the actual new message. Proceed only for an exact configured sender and a subject unambiguously indicating that a named person messaged or replied.

Use the email only as a notification signal, not as the complete LinkedIn conversation. In the user's Supabase project `{{SUPABASE_PROJECT_ID}}`, find exactly one Outreach contact using normalized LinkedIn identity when available; otherwise require exact normalized full name and use employer or title evidence only to disambiguate. Never guess or update multiple contacts.

For one exact match, call `public.record_inbound_message_signal` with source `gmail_signal`, an idempotent external key containing the Gmail message ID, a concise subject/snippet excerpt, and the email timestamp. Confirm that any proactive follow-up was cancelled and one reply task exists in `context_required` state.

For no unique match, make no database change and report it for manual review. Do not draft from the partial email. Never automatically send a LinkedIn message, email, résumé, application, or follow-up.
