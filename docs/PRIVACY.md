# Privacy model

## Data locations

| Data | Location | Included in public source |
| --- | --- | --- |
| Career and targeting preferences | User-owned Supabase | No |
| Contacts and recommendations | User-owned Supabase | No |
| Outreach history and drafts | User-owned Supabase | No |
| Gmail authorization and messages | User's connected Gmail/ChatGPT task | No |
| LinkedIn password and session | Authenticated controlled browser | Never stored |
| Demo records | Bundled synthetic fixtures | Yes, visibly labelled |
| Supabase project URL/publishable key | Deployment environment or local browser | No default value |

## Enforcement

- Every exposed production table has RLS enabled.
- Anonymous database roles receive no outreach table access.
- The first-owner claim is atomic and cannot replace an existing owner.
- Privileged functions live in the unexposed `outreach_private` schema, validate `auth.uid()`, and expose narrowly granted wrappers.
- Browser-authenticated roles never receive `TRUNCATE`, `REFERENCES`, or `TRIGGER` on Outreach tables; RLS cannot secure those table-wide privileges.
- A queued browser action is not a recorded outcome.
- Only visible LinkedIn success may record a send or withdrawal.
- Exports exclude credentials and authentication tokens.
- Full relationship and personalization deletion requires the exact phrase `DELETE ALL OUTREACH DATA`. The authentication account and anti-takeover ownership row remain.

## Public-release prohibition

Never commit real names, personal email addresses, contact lists, résumé content, career preferences, Supabase project references, API keys, Site project identifiers, automation IDs, browser tokens, screenshots of private data, or production database exports.
