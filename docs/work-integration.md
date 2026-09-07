# Private ChatGPT Work integration

The dashboard remains on GitHub Pages. The `outreach-work` Supabase Edge Function exposes six authenticated MCP tools: inspect, claim, begin attempt, record outcome, recover outcome, and receipt lookup. Runner instructions travel in the MCP initialize response and queue inspection response.

## Activation

1. Enable Supabase Auth's OAuth server for this project and configure its authorization page to reach the deployed Outreach page with the supplied `authorization_id` query parameter. The page preserves that parameter through sign-in.
2. Configure the private integration in ChatGPT with the endpoint copied from Outreach Settings → ChatGPT Work. Use OAuth and the redirect URI supplied by ChatGPT. Configure a client through Supabase's supported OAuth registration flow; do not put client secrets in GitHub Pages.
3. The owner signs into Outreach and approves the named client through the consent page. Access is checked against both the existing workspace allowlist and the owner's approved OAuth client. Disconnect revokes the client at the application guard immediately and then revokes the OAuth grant.
4. From ChatGPT Work, inspect an existing queue. Confirm Settings records the successful call. Run a **recording-only** receipt/inspection check before executing new outreach. Deployment alone is not an end-to-end connection test.

Guidance: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication

## Execution protocol

Save one operation UUID per mutation and keep its entire payload unchanged when retrying. Inspect the frozen queue, obtain a persisted claim, and persist an attempt for each recipient before processing it. Use the claim's execution ID. A pending attempt blocks another attempt. Non-send results also receive receipts; following someone is never connection evidence.

After each visible result, record it immediately. If that update fails, stop LinkedIn actions and retrieve the recording operation's receipt. Retry only that same database recording, never the invitation. Recovery records fresh read-only verification separately from execution authorization, even when another queue exists.

Uncertain results remain held until verified. Confirmed pre-send identity blocks and non-send skips are terminal for that recipient. Queue ordering, frozen drafts, exclusions, and owner checks remain in force. The integration has no arbitrary SQL or caller-supplied owner parameter.

## Authentication and deployment

Deploy `supabase/functions/outreach-work/index.ts`, its `deno.json`, and `worker/work-mcp.mjs` together. Gateway JWT verification is disabled only because the handler validates OAuth JWT claims, expiry, issuer and user through Supabase Auth, and checks workspace/client authorization on every request. Public OAuth resource discovery is the only unauthenticated endpoint. All tool database calls use the caller's bearer token and public project key; no service-role credential is used.

Apply the authenticated recording and recovery guard migrations before deploying the dashboard. Private attempt, claim, hold, and receipt tables deny direct access. The public RPC authenticates through the existing owner guard. Existing RPC signatures remain available.

## Validation

- `node --test tests/*.test.mjs`: workflow contracts and MCP authentication/argument tests.
- `supabase/tests/work-recording.assert.sql`: rollback-only synthetic owner, queue, attempt, idempotency, conflict, recovery, skip, revocation and capacity checks on a migrated test database.
- Existing rolling queue assertions verify allocation and FIFO behavior.
- `npm run typecheck`, `npm run lint`, `npm run build:pages`, and production dependency/privacy scans.

Recovered invitations retain the frozen message but label the recorded observation as verification time, not a reconstructed precise send timestamp. Confirmed current acceptance is recorded separately from the earlier invitation.
