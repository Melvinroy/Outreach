import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/page.tsx");
const migration = read("supabase/migrations/014_discarded_contacts.sql");

test("profile and opportunity links replace redundant action buttons", () => {
  assert.match(page, /className="person-link"/);
  assert.match(page, /className="opportunity-link"/);
  assert.match(page, /Move to Discarded/);
  assert.doesNotMatch(page, /title="Open LinkedIn"/);
  assert.doesNotMatch(page, /title="Open role or activity"/);
});

test("discarded contacts are hidden, restorable and stored durably", () => {
  assert.match(page, /TabsTrigger value="discarded"/);
  assert.match(page, /function DiscardedQueue/);
  assert.match(page, /set_outreach_contact_discarded/);
  assert.match(page, /availableQueue = data\.queue\.filter/);
  assert.match(migration, /create table if not exists public\.outreach_discarded_contacts/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /discarded_by = \(select auth\.uid\(\)\)/);
});

test("discard prevents accidental sends from stale Codex batches", () => {
  assert.match(migration, /Batch cleared because a selected contact was discarded/);
  assert.match(migration, /reject_discarded_assist_session/);
  assert.match(migration, /Discarded contacts cannot be added to an outreach batch/);
});
