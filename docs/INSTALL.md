# Private installation

This project ships with no database connection, owner identity, contacts, Gmail authorization, LinkedIn session, targeting profile, or deployment identifier.

## 1. Create a Supabase project

Create a project owned by you. In its SQL editor, run the files under `supabase/migrations` in filename order, beginning with `000_outreach_core.sql` and ending with the highest numbered migration.

Only use the project URL and browser-safe publishable key in a web client. Never use a secret key, service-role key, database password, access token, or LinkedIn credential.

## 2. Configure authentication

Enable email authentication in Supabase. Add the exact deployed dashboard URLs to the Auth redirect allowlist. Password and magic-link sign-in are supported.

Require at least eight password characters and enable leaked-password protection when the project plan supports it. This Supabase account-level Auth control must be enabled in the dashboard; SQL migrations cannot configure it.

## 3. Open the dashboard

When no deployment environment is configured, the dashboard opens the setup wizard. Enter the project URL and publishable key. They remain in that browser's storage.

Sign in. The first authenticated user may select **Claim new installation**. The database claims an empty installation atomically and refuses to replace an existing owner.

Finish the private personalization step. Career background, targets, locations, companies, timing, and message preferences remain in the user's Supabase project.

## 4. Deploy to GitHub Pages

Fork the repository and enable Pages through GitHub Actions. The checked-in workflow always builds a generic setup-first release and deliberately does not inject any repository Supabase values.

For a preconfigured private deployment, follow `docs/CHATGPT_SITES.md` or maintain a private deployment workflow that supplies only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never add those values to the reusable public workflow or source tree.

## 5. Optional ChatGPT workflows

Install the bundled `outreach-linkedin-runner` plugin in a supported Codex or ChatGPT environment. Connect Supabase, Gmail, and Computer Use separately under the user's own account.

Use `docs/AUTOMATIONS.md` for Gmail event tasks. Gmail is a signal only; LinkedIn actions remain user-selected, browser-verified, and visibly confirmed.
