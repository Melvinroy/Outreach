---
name: outreach-batch-runner
description: Run a supervised user-selected Outreach batch with browser computer use. Use when the user says “run my selected outreach batch,” “reach out to the selected contacts,” “use Codex to reach out,” or provides an Outreach batch code. This skill executes already-selected LinkedIn connection requests; it does not discover contacts or run unattended bulk outreach.
---

# Outreach Batch Runner

Run the exact frozen batch selected in the Outreach dashboard. Treat queueing as preparation only. Never infer that a connection request was sent from an opened profile or completed browser navigation.

## Resolve the batch

1. Find the configured Outreach Supabase project.
2. Resolve the supplied eight-character batch code. If no code is supplied, load the authenticated/allowlisted user's latest active batch.
3. Load the batch and its sessions in `sequence_no` order from `outreach_assist_batches` and `outreach_assist_sessions`, including each session's status and guardrail outcome.
4. If more than one user's batch could match, stop and ask for the displayed batch code. Never guess an owner.
5. Show the user a compact review containing the exact recipients, employers, and frozen messages.

## Browser authentication

- Use the supported ChatGPT/Codex browser authentication flow.
- Prefer an existing signed-in LinkedIn tab/session when available.
- If sign-in is required, pause for the user to authenticate through the secure browser form or browser takeover.
- Never ask the user to paste a LinkedIn password into chat.
- Never read, copy, store, export, or write credentials to Supabase, files, logs, or skill state.

## Batch authorization

The user's direct voice/text instruction to run the selected outreach batch is the single authorization for every exact recipient and frozen message in that batch. Do not ask for approval per contact and do not add another routine confirmation after this command.

Before acting, resolve the latest active batch and ensure its owner, recipient count, profiles, and frozen messages match the queued data. Ask the user only if the batch is ambiguous, the requested batch cannot be resolved, or a recipient/message materially differs from the frozen record.

## Execute sequentially

For each session in order:

1. If the session is already `completed`, `skipped`, `cancelled`, or `failed`, do not repeat it. Continue with the next `prepared` session.
2. Before opening LinkedIn, check the frozen contact's recorded relationship status and activities. Do not run a connection flow when prior outreach is already recorded.
3. Open the frozen `profile_url_snapshot` and verify the visible profile name and current employer against the frozen contact record.
4. Before clicking Connect, classify any visible pre-existing relationship state:
   - LinkedIn shows `Pending` or an invitation-withdrawal state: `already_pending`.
   - LinkedIn shows a first-degree relationship or Message without a Connect action: `already_connected`.
   - LinkedIn shows a prior conversation or other unambiguous contact history while the relationship state remains unclear: `previously_contacted`.
5. For one of those normal guardrail outcomes, call `skip_browser_assisted_outreach(session_id, outcome, concise visible evidence)`. Do not open the note composer, click Send, or call the failure/cancellation function. Continue automatically to the next session.
6. If the identity does not match, record a concise failure reason and stop because the frozen target is unreliable.
7. Otherwise start LinkedIn's connection flow.
8. Use the exact frozen `message_snapshot`; do not rewrite or personalize it further.
9. Confirm the note remains within LinkedIn's displayed limit.
10. Click Send only when the user's current instruction explicitly runs this resolved batch and the target still matches.
11. Wait for a visible platform success state.
12. Only after visible success, call `confirm_browser_assisted_outreach(session_id, 'linkedin_invitation_sent_visible')` in the batch owner's authenticated context.
13. Continue to the next session.

Never infer a relationship state from a missing button alone. Use a guardrail outcome only when LinkedIn displays an unambiguous state or history. A guardrail skip is a protected outcome, not a send and not a failure.

## Stop conditions

Stop the batch without attempting workarounds if LinkedIn shows any of the following:

- invitation or weekly limit;
- account restriction or warning;
- CAPTCHA, identity verification, or suspicious-login challenge;
- a changed Send flow that makes the final action ambiguous;
- profile mismatch;
- missing or altered connection note;
- repeated platform errors.

Ask the user to handle verification challenges directly. Do not bypass safeguards or retry aggressively.

## Finish and report

- Mark only visibly confirmed sends as completed. Record pre-existing relationships as `skipped` with the structured guardrail outcome.
- Never count a guardrail skip as a send by this batch. If preflight visibly confirms an earlier pending invitation or connection, preserve that separately as observed relationship evidence.
- Report completed, protected/skipped, failed, and remaining counts. Break protected skips down into already pending, already connected, and previously contacted.
- Include recipient names for every skipped or failed item and the reason.
- If the batch stops early, preserve remaining prepared sessions for a deliberate follow-up run unless the user explicitly cancels them.
