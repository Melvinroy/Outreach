import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoControlCenter,
  applyDemoCommand,
  projectControlCenter,
  currentAction,
  previewContactImport,
  projectMilestones,
} from "../lib/control-center.mjs";
const now = Date.parse("2026-09-05T06:00:00Z");

test("automatic sample intake needs no form and preserves an existing outbound without duplicating the person", () => {
  let s = applyDemoCommand(
    createDemoControlCenter(now),
    "simulate_connection_sync",
    {},
    now,
  );
  s = applyDemoCommand(s, "simulate_connection_sync", {}, now);
  assert.equal(s.contacts.length, 11);
  const c = s.contacts.find((c) => c.full_name === "Drew Morgan");
  assert.equal(s.messages.filter((m) => m.contact_id === c.id).length, 1);
  assert.equal(currentAction(s, c.id).intent, "follow_up");
  assert.equal(
    projectControlCenter(s, now).stages.waiting.includes(c.id),
    true,
  );
});

test("source milestones count people once and do not infer invitations from outside connections", () => {
  const s = createDemoControlCenter(now);
  s.messages.push({
    ...s.messages.find((m) => m.direction === "outbound"),
    id: "another-message",
  });
  const row = projectMilestones(s).find((r) => r.label === "Other connections");
  assert.equal(row.people, 4);
  assert.equal(row.invited, 0);
  assert.equal(row.messaged, 1);
});
test("every person contributes to exactly one current work queue", () => {
  const s = createDemoControlCenter(now),
    p = projectControlCenter(s, now);
  const ids = Object.values(p.stages).flat();
  assert.equal(ids.length, s.contacts.length);
  assert.equal(new Set(ids).size, s.contacts.length);
  assert.deepEqual(
    [
      p.discovered.length,
      p.outside.length,
      p.stages.review.length,
      p.stages.waiting.length,
    ],
    [6, 4, 2, 2],
  );
});
test("manual differently worded reply cancels sample queued send and creates waiting", () => {
  const s = applyDemoCommand(
    createDemoControlCenter(now),
    "manual_message",
    {
      contact_id: "sample-5",
      direction: "outbound",
      body: "I sent this from my phone",
    },
    now,
  );
  assert.equal(
    s.jobs.find((j) => j.contact_id === "sample-5").state,
    "cancelled",
  );
  assert.equal(currentAction(s, "sample-5").intent, "follow_up");
  assert.ok(projectControlCenter(s, now).stages.waiting.includes("sample-5"));
});
test("confirmed sample send then new inbound returns to preparation", () => {
  let s = createDemoControlCenter(now);
  s = applyDemoCommand(s, "simulate_send", { contact_id: "sample-5" }, now);
  assert.ok(projectControlCenter(s, now).stages.waiting.includes("sample-5"));
  s = applyDemoCommand(
    s,
    "manual_message",
    {
      contact_id: "sample-5",
      direction: "inbound",
      body: "Thanks, tell me more",
    },
    now + 1000,
  );
  assert.equal(currentAction(s, "sample-5").intent, "reply");
  assert.ok(
    projectControlCenter(s, now + 1000).stages.prepare.includes("sample-5"),
  );
});
test("import previews invalid and duplicate identities without creating people", () => {
  const contacts = createDemoControlCenter(now).contacts;
  const rows = previewContactImport(
    JSON.stringify([
      {
        name: "Duplicate",
        employer: "Fixture",
        profile_url: "https://linkedin.com/in/SAMPLE-0/?trk=x",
      },
      {
        name: "New",
        employer: "Fixture",
        profile_url: "https://linkedin.com/in/new-fixture",
      },
      {
        name: "Bad",
        employer: "Fixture",
        profile_url: "https://example.com/in/foo",
      },
    ]),
    contacts,
  );
  assert.deepEqual(
    rows.map((r) => r.status),
    ["existing", "new", "invalid"],
  );
  assert.equal(contacts.length, 10);
});

test("uncertain work stays visible after closing and requires an explicit resolution", () => {
  let s = createDemoControlCenter(now);
  s = applyDemoCommand(s, "close", { contact_id: "sample-9" }, now);
  assert.equal(
    projectControlCenter(s, now).stages.attention.includes("sample-9"),
    true,
  );
  s = applyDemoCommand(
    s,
    "resolve_uncertain",
    {
      contact_id: "sample-9",
      job_id: "job-9",
      resolution: "not_sent",
      note: "Checked the full thread; there is no outbound message.",
    },
    now,
  );
  assert.equal(s.jobs.find((j) => j.id === "job-9").state, "skipped");
  assert.equal(
    projectControlCenter(s, now).stages.closed.includes("sample-9"),
    true,
  );
});
