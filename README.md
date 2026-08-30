# Outreach Intelligence

An open-source, human-supervised workspace for tracking the full professional outreach journey:

`discovered → recommended → attempted → accepted → followed up → replied → meeting`

The project deliberately separates research recommendations from verified outreach outcomes. Dashboard metrics are calculated from explicit relationship events rather than assumptions.

## Version 1.0 — private-by-default release

- Fresh-install migrations with no personal seed data
- Demo-first dashboard with safe synthetic data and no Gmail, LinkedIn, or database connection
- Top-right private-workspace setup for a user-owned Supabase project and first-owner claim
- Private targeting and writing preferences stored only in the user's database
- Export and exact-confirmation deletion controls
- Generic Gmail automation templates with user-supplied placeholders
- A distributable, human-supervised LinkedIn runner plugin
- GitHub Pages and ChatGPT Sites deployment instructions
- Automated privacy scanning, contract tests, lint, and production builds
- Dependency auditing, TypeScript validation, reachable-history scanning, and least-privilege database grants

## Phase 1 capabilities

- A focused one-page action queue for role-linked leaders and strategic executives
- Supabase password and magic-link authentication with a private user allowlist
- Read-only browser access enforced by PostgreSQL Row Level Security
- Exact personalized messages with one-click copy and verified source links
- Honest funnel metrics calculated only from recorded relationship activities
- Company concentration and daily shortlist summaries
- Responsive GitHub Pages and ChatGPT Sites deployment support

## Phase 2 capabilities

- Human-confirmed status updates from each contact row
- Atomic Supabase activity recording and contact-state advancement
- A dedicated follow-up queue for connected and active relationships
- Live pipeline metrics derived from recorded activity events
- Allowlist-scoped update and insert policies with no anonymous writes

## Phase 3 capabilities

- Checkboxes for any subset of the shortlist plus select-all-visible
- One **Queue for Codex** action for a supervised batch of up to 15 contacts
- Frozen profile and message snapshots in deterministic execution order
- A voice/text invocation: `Run my selected outreach batch`
- Secure reuse of a signed-in ChatGPT/Codex browser session; credentials are never stored in Outreach
- The voice/text run command acts as one authorization for the exact frozen batch, with no per-contact approval prompts
- A separate visible-success confirmation before `request_sent` is recorded
- Browser preflight outcomes for already pending, already connected and previously contacted profiles
- Automatic protected skips that never enter the Connect/Send path or count as batch failures
- Cross-run contact identity based on normalized LinkedIn `/in/` slugs, with name-plus-company fallback only when necessary
- A duplicate audit showing both browser-protected sends and scheduled-discovery matches
- Superseded, cancelled and failed batches that never inflate outreach metrics
- `browser_assisted` evidence kept distinct from manual status updates

## Phase 4 capabilities

- Idempotent acceptance reconciliation from Gmail, visible LinkedIn checks, or explicit manual updates
- Ambiguous signals routed to review without changing a relationship state
- Exactly one frozen first-follow-up task per newly connected person
- Checkbox-driven follow-up batches with one voice/text command: `Run my selected follow-up batch`
- Hourly stale-request evaluation and a dedicated withdrawal queue after 14 days
- Checkbox-driven withdrawal batches with one voice/text command: `Withdraw my selected stale invitations`
- LinkedIn preflight checks for recipient identity, prior conversation, replies, and current pending state
- Visible-success confirmation before a follow-up or withdrawal is recorded
- Durable LangGraph checkpoints plus database workflow history for reconciliation, task refresh, and browser batches
- Private privileged database implementations behind security-invoker RPC wrappers

Gmail is a detection signal, not a sending channel. A matching acceptance email may create a follow-up task, but LinkedIn is opened only for verification and user-commanded actions. The Gmail connector automation is configured separately for each ChatGPT user and is not stored in this repository.

## Phase 5 capabilities

- Two deterministic post-acceptance branches: inbound reply or silent-acceptance follow-up
- A six-hour response window before a proactive follow-up becomes reviewable
- Gmail message-event detection for LinkedIn `just messaged you` and `Message replied` notifications
- Inbound messages immediately cancel any active proactive follow-up for the same contact
- A dedicated Replies queue that requires Codex to read the visible LinkedIn conversation before drafting
- Editable reply and proactive-follow-up drafts with an explicit human approval gate
- Only approved messages can enter a frozen Computer Use batch
- Browser preflight rejects stale drafts when a newer LinkedIn message changes the context
- Visible LinkedIn success required before any reply or follow-up is recorded as sent
- Independent LangGraph routing and durable database checkpoints for conversation work

The Gmail notification contains only a signal or excerpt. It is never treated as the complete conversation. Computer Use reads the visible LinkedIn thread, prepares the draft, and stops for review. The final batch command authorizes only the exact messages already approved in the dashboard.

GitHub Pages hosts only the static interface. Supabase provides authentication and the protected database; the browser receives only rows permitted by RLS.

## Quick start

```bash
npm ci
npm run dev
```

The official `melvinroy.github.io/Outreach` deployment is preconfigured with its browser-safe Supabase project URL and publishable key, so it opens password or email-link sign-in directly and restores an existing browser session automatically. Other deployments open a one-time private workspace connection screen unless they provide environment configuration. The responsive synthetic dashboard remains available only as an explicit preview and never connects or sends anything.

Complete installation instructions: [docs/INSTALL.md](docs/INSTALL.md).

## Supabase setup

1. Create a Supabase project.
2. Run the SQL migrations in `supabase/migrations` in order.
3. Copy the project URL and **publishable** key.
4. Configure those values as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Sign in once and select **Claim new installation**. The first authenticated user is claimed atomically; an existing owner can never be replaced by this flow.
6. Complete the private profile setup inside the dashboard.

Never enter or expose a Supabase secret key, service-role key, database password, LinkedIn password or browser session token.

## Database model

- Core: `outreach_runs`, `outreach_contacts`, `outreach_recommendations`, `outreach_activities`
- Access: `outreach_app_access`, `outreach_user_settings`
- Supervised browser runs: `outreach_assist_*`, `outreach_phase4_*`, `outreach_phase5_*`
- Durable routing: reconciliation, relationship, conversation, duplicate, and workflow tables

Every table exposed to the browser has RLS enabled. The anonymous role has no table access. The private production dashboard reads the `outreach_*` tables only when the signed-in user has a matching `outreach_app_access` row.

The older `oi_*` foundation remains migration-compatible but is not used by the current dashboard.

## GitHub Pages

Every push to `main` runs the full verification gate. The named GitHub Pages deployment uses only its browser-safe publishable configuration to open Supabase Auth directly; passwords and privileged keys are never bundled. Forks remain setup-first unless they provide their own environment values.

```bash
npm run build:pages
```

## Current boundary

All LinkedIn actions remain user-directed. The dashboard silently prepares a selected batch, and the user's voice/text instruction is the single authorization for its exact frozen recipients and actions. No modal or per-contact approval is required. A static GitHub Pages button cannot wake a ChatGPT conversation, so the secure bridge is the short voice/text command after queueing. The app does not store LinkedIn credentials, run unattended bulk automation, bypass platform safeguards, or infer success from an opened profile, email, or typed-but-unsent message.

## Documentation

- [Private installation](docs/INSTALL.md)
- [ChatGPT automation templates](docs/AUTOMATIONS.md)
- [ChatGPT Sites deployment](docs/CHATGPT_SITES.md)
- [Privacy model](docs/PRIVACY.md)
- [Security policy](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE).
