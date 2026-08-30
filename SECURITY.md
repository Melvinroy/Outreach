# Security policy

Report security issues privately to the repository owner rather than opening a public issue containing credentials, personal data, database identifiers, or reproducible account-access details.

The project accepts only browser-safe Supabase publishable keys in clients. Secret keys, service-role keys, database passwords, LinkedIn credentials, Gmail tokens, browser session tokens, and exported production data must never be committed.

Before a release, run `npm run privacy:scan`, `npm run privacy:history`, `npm run security:audit`, `npm run typecheck`, `npm run lint`, and `npm test`, then review Supabase security and performance advisors on the target project.

Keep leaked-password protection enabled in Supabase Auth when the project plan supports it. Never grant `TRUNCATE`, `REFERENCES`, or `TRIGGER` on Outreach tables to browser roles. A named public frontend may include only its browser-safe Supabase project URL and modern publishable key so it can open Auth directly; all data access must remain protected by Auth, the installation allowlist, and RLS.
