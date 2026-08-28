# ChatGPT Sites deployment

Create a new Site from this source using the Sites workflow. Do not copy another installation's `.openai/hosting.json`; Sites creates that file for the new owner's project.

Configure only these browser-safe runtime values for a preconnected private deployment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Keep the Site owner-only or explicitly allowlisted while it displays real outreach data. ChatGPT Site sign-in protects the hosted route; Supabase Auth and RLS independently protect the database.

The public repository intentionally ignores `.openai/hosting.json` so forks cannot point at the source owner's hosted Site.
