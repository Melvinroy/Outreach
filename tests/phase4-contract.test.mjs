import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/008_phase_four_relationship_orchestration.sql", import.meta.url), "utf8");
const followUpSkill = await readFile(new URL("../.codex/skills/outreach-followup-runner/SKILL.md", import.meta.url), "utf8");
const withdrawalSkill = await readFile(new URL("../.codex/skills/outreach-withdrawal-runner/SKILL.md", import.meta.url), "utf8");

test("Gmail evidence is idempotent and ambiguous evidence cannot advance status", () => {
  assert.match(migration, /unique index outreach_reconciliation_external_evidence_uq/);
  assert.match(migration, /if v_event_id is not null then/);
  assert.match(migration, /p_observed_state = 'ambiguous'/);
  assert.match(migration, /waiting_for_user/);
});

test("stale withdrawal tasks require fourteen days and visible LinkedIn confirmation", () => {
  assert.match(migration, /interval '14 days'/);
  assert.match(migration, /linkedin_invitation_withdrawn_visible/);
  assert.match(withdrawalSkill, /still pending/);
  assert.match(withdrawalSkill, /already connected/i);
});

test("follow-up batches freeze messages and protect against duplicate sends", () => {
  assert.match(migration, /message_snapshot/);
  assert.match(migration, /already has sent-message evidence/);
  assert.match(migration, /linkedin_message_sent_visible/);
  assert.match(followUpSkill, /inspect visible history/);
  assert.match(followUpSkill, /Do not request confirmation per person/);
});
