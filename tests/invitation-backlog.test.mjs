import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoControlCenter,
  applyDemoCommand,
} from "../lib/control-center.mjs";
import { projectInvitationBacklog } from "../lib/invitation-backlog.mjs";
import { syncInvitationInventory } from "../orchestration/invitation-inventory.mjs";
const now = Date.parse("2026-09-05T06:00:00Z");
const aged = () =>
  applyDemoCommand(
    createDemoControlCenter(now),
    "demo_backlog_scenario",
    { scenario: "aged" },
    now,
  );
test("stale inventory cannot establish capacity or enable invitations",()=>{
 const s=aged();s.invitation_backlog.inventory.verified_at=new Date(now-25*3600000).toISOString();const model=projectInvitationBacklog(s,now);assert.equal(model.verified_count,null);assert.equal(model.can_invite,false);assert.ok(model.candidates.every(c=>c.needs_check));
});
test("oldest-first age review excludes accepted people and newer messages", () => {
  const s = aged();
  assert.deepEqual(
    projectInvitationBacklog(s, now).candidates.map((c) => c.age_days),
    [30, 20],
  );
  s.contacts.find((c) => c.id === "sample-0").connection_status = "connected";
  s.messages.push({
    contact_id: "sample-1",
    occurred_at: new Date(now).toISOString(),
  });
  assert.equal(projectInvitationBacklog(s, now).candidates.length, 0);
});
test("capacity cleanup needs full fresh dated inventory; restriction always blocks invitations", () => {
  const s = aged();
  s.invitation_backlog.policy = {
    withdrawal_days: 90,
    pending_threshold: 1,
    threshold_mode: "cleanup",
  };
  let m = projectInvitationBacklog(s, now);
  assert.equal(m.can_invite, false);
  assert.deepEqual(
    m.candidates.map((c) => c.age_days),
    [30, 20],
  );
  s.invitation_backlog.items[0].sent_at = null;
  assert.equal(projectInvitationBacklog(s, now).candidates.length, 0);
  s.invitation_backlog.inventory.coverage = "partial";
  m = projectInvitationBacklog(s, now);
  assert.equal(m.verified_count, null);
  assert.equal(m.can_invite, false);
  s.invitation_backlog.inventory.account_state = "restricted";
  assert.equal(projectInvitationBacklog(s, now).health, "restricted");
});
test("invalid policy is rejected without mutating state", () => {
  const s = aged();
  assert.throws(
    () =>
      applyDemoCommand(
        s,
        "set_invitation_policy",
        { withdrawal_days: 0, pending_threshold: null, threshold_mode: "warn" },
        now,
      ),
    /Invalid/,
  );
  assert.equal(s.invitation_backlog.policy.withdrawal_days, 14);
});
test("inventory collector checkpoints only complete pagination and never guesses completeness", async () => {
  const item = {
    profile_url: "https://linkedin.com/in/example",
    full_name: "Example",
  };
  let saved;
  await syncInvitationInventory({
    readPendingPage: async () => ({
      items: [item],
      complete: true,
      account_state: "clear",
    }),
    recordInventory: async (p) => (saved = p),
  });
  assert.equal(saved.complete, false);
  saved = null;
  let n = 0;
  await assert.rejects(
    syncInvitationInventory({
      readPendingPage: async () => {
        if (n++) throw new Error("network");
        return { items: [item], next_cursor: "next", complete: true, total: 2 };
      },
      recordInventory: async (p) => (saved = p),
    }),
    /network/,
  );
  assert.equal(saved, null);
});
