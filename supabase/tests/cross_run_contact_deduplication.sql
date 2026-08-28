-- Run against a disposable database or inside a rolled-back transaction.

begin;

-- 1. URL variants resolve to the same stable LinkedIn identity.
select public.normalize_linkedin_identity('https://www.linkedin.com/in/Example-Person/?trk=test#about');
select public.normalize_linkedin_identity('http://linkedin.com/in/example-person');

-- 2. A case/query/slash variant of an existing profile inserts zero rows.
-- with attempted as (
--   insert into public.outreach_contacts (
--     full_name, employer, linkedin_profile_url, first_recommended_date, last_recommended_date
--   ) values (
--     'Variant', 'Test', '<existing-profile-url-variant>', current_date, current_date
--   )
--   on conflict (linkedin_identity_key) where linkedin_identity_key is not null do nothing
--   returning id
-- ) select count(*) from attempted;

-- 3. When no usable LinkedIn key exists, whitespace and case variants of name
-- plus employer resolve to the same conservative fallback identity.
select public.normalize_name_employer_identity('  Example   Person ', 'ACME  Corp');
select public.normalize_name_employer_identity('example person', 'acme corp');

-- 4. Duplicate audit rows are readable only by allowlisted authenticated users.
-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', '<allowlisted-user-uuid>', true);
-- select duplicate_reason, count(*) from public.outreach_discovery_duplicates group by duplicate_reason;

rollback;
