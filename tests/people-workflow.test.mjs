import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoControlCenter,
  applyDemoCommand,
  peopleFocusOptions,
  matchesPeopleFocus,
  canSelectOutreach,
  currentAction,
  peoplePriority,
} from "../lib/control-center.mjs";
const now = Date.parse("2026-09-05T10:00:00Z");
test("four people views keep legacy eligibility checks separate", () => {
  const s = createDemoControlCenter(now);
  assert.equal(peopleFocusOptions.length, 4);
  assert.deepEqual(
    s.contacts
      .filter((c) => matchesPeopleFocus(s, c, "to_connect", now))
      .map((c) => c.id),
    ["sample-0", "sample-1"],
  );
  assert.equal(canSelectOutreach(s, "sample-2", now), false);
  assert.equal(canSelectOutreach(s, "sample-5", now), false);
  assert.equal(canSelectOutreach(s, "sample-0", now), true);
});
test("two selected invitations prepare and queue independently without changing unselected people", () => {
  let s = createDemoControlCenter(now);
  for (const id of ["sample-0", "sample-1"])
    s = applyDemoCommand(s, "prepare", { contact_id: id }, now);
  for (const id of ["sample-0", "sample-1"]) {
    const a = currentAction(s, id);
    s = applyDemoCommand(
      s,
      "approve",
      {
        contact_id: id,
        text: a.draft_text,
        draft_revision: a.draft_revision,
        batch_id: "selected-batch",
      },
      now,
    );
  }
  assert.equal(s.jobs.filter((j) => j.batch_id === "selected-batch").length, 2);
  assert.equal(currentAction(s, "sample-4").state, "preparation");
  assert.equal(canSelectOutreach(s, "sample-0", now), false);
});

test("a discovery invitation stays unqueued until its exact saved draft has verified context", () => {
  let s = createDemoControlCenter(now);
  const original =
    "Sample draft: Hi Avery, your product work is relevant to this opportunity.";
  s = applyDemoCommand(
    s,
    "save_draft",
    { contact_id: "sample-0", text: original },
    now,
  );
  const saved = currentAction(s, "sample-0");
  assert.equal(saved.draft_text, original);
  assert.equal(saved.state, "review");
  assert.throws(
    () =>
      applyDemoCommand(
        s,
        "approve",
        {
          contact_id: "sample-0",
          text: `${original} changed`,
          draft_revision: saved.draft_revision,
        },
        now,
      ),
    /Review the current verified draft first/,
  );
  assert.equal(
    s.jobs.some((job) => job.contact_id === "sample-0"),
    false,
  );
});
test("keep for later and discard remove candidates and remain discoverable in Set aside", () => {
  let s = createDemoControlCenter(now);
  s = applyDemoCommand(
    s,
    "snooze",
    {
      contact_id: "sample-0",
      until: new Date(now + 3 * 86400000).toISOString(),
    },
    now,
  );
  s = applyDemoCommand(s, "discard", { contact_id: "sample-1" }, now);
  for (const id of ["sample-0", "sample-1"]) {
    const c = s.contacts.find((c) => c.id === id);
    assert.equal(matchesPeopleFocus(s, c, "set_aside", now), true);
    assert.equal(matchesPeopleFocus(s, c, "to_connect", now), false);
    assert.equal(canSelectOutreach(s, id, now), false);
  }
});

test("default focus ranks replies before new connections and drops queued or waiting work", () => {
  const s = createDemoControlCenter(now);
  const shown = s.contacts
    .filter((c) => matchesPeopleFocus(s, c, "priority", now))
    .sort(
      (a, b) => peoplePriority(s, a.id, now) - peoplePriority(s, b.id, now),
    );
  assert.deepEqual(
    shown.map((c) => c.id),
    ["sample-4", "sample-6", "sample-7", "sample-3"],
  );
  assert.ok(shown.some((c) => c.id === "sample-3"));
  assert.ok(shown.some((c) => c.id === "sample-7"));
  for (const id of ["sample-0", "sample-2", "sample-5", "sample-8"])
    assert.ok(!shown.some((c) => c.id === id));
  let next = applyDemoCommand(
    s,
    "approve",
    {
      contact_id: "sample-7",
      text: currentAction(s, "sample-7").draft_text,
      draft_revision: currentAction(s, "sample-7").draft_revision,
    },
    now,
  );
  assert.equal(
    matchesPeopleFocus(
      next,
      next.contacts.find((c) => c.id === "sample-7"),
      "priority",
      now,
    ),
    false,
  );
});

test("50-contact sample preserves unique identities and per-person job relationships", () => {
  const s = applyDemoCommand(
    createDemoControlCenter(now),
    "demo_backlog_scenario",
    { scenario: "volume" },
    now,
  );
  assert.equal(s.contacts.length, 50);
  assert.equal(new Set(s.contacts.map((c) => c.id)).size, 50);
  for (const j of s.jobs)
    assert.ok(
      s.actions.some(
        (a) => a.id === j.action_id && a.contact_id === j.contact_id,
      ),
    );
});
