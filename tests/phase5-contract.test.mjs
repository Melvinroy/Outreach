import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/011_phase_five_conversation_routing.sql", import.meta.url), "utf8");
const replySkill = await readFile(new URL("../.codex/skills/outreach-reply-runner/SKILL.md", import.meta.url), "utf8");

test("inbound messages supersede silent follow-ups and remain idempotent", () => {
  assert.match(migration, /outreach_conversation_events_external_uq/);
  assert.match(migration, /Superseded by an inbound LinkedIn message/);
  assert.match(migration, /context_required/);
});

test("all Phase 5 messages require review before batching", () => {
  assert.match(migration, /approve_phase5_draft/);
  assert.match(migration, /t\.status = 'approved'/);
  assert.match(replySkill, /Never send an unapproved draft/);
});

test("browser confirmation is required for replies and proactive follow-ups", () => {
  assert.match(migration, /linkedin_reply_sent_visible/);
  assert.match(migration, /linkedin_follow_up_sent_visible/);
  assert.match(replySkill, /visibly appears in the correct conversation/);
});
