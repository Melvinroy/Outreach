import test from "node:test";
import assert from "node:assert/strict";
import { syncWorkspace } from "../orchestration/workspace-sync.mjs";
import {
  createDemoControlCenter,
  inboxNeedsAction,
  applyDemoCommand,
} from "../lib/control-center.mjs";
const item = (i, revision = "1") => ({
  thread_id: `thread-${i}`,
  revision,
  profile_url: `https://www.linkedin.com/in/person-${i}`,
});
const observation = (i) => ({
  identity_verified: true,
  complete: true,
  observed_at: new Date().toISOString(),
  profile_url: i.profile_url,
  messages: [
    { key: "manual-outbound", direction: "outbound", body: "Already replied" },
  ],
});
function fixture(items, seen = {}) {
  const calls = [];
  let reads = 0;
  return {
    calls,
    get reads() {
      return reads;
    },
    deps: {
      rpc: async (cmd, p) => {
        calls.push([cmd, p]);
        return cmd === "claim" ? { attempt_id: "run", seen } : {};
      },
      listConversationPage: async () => ({
        conversations: items,
        complete: true,
      }),
      readConversation: async (i) => {
        reads++;
        return observation(i);
      },
      syncConnections: async () => {},
      reconcileDueWork: async () => {},
    },
  };
}
test("200 unchanged conversations open no threads; changed outgoing reply is ingested", async () => {
  const items = Array.from({ length: 200 }, (_, i) => item(i));
  const seen = Object.fromEntries(
    items.map((i) => [
      i.thread_id,
      { revision: i.revision, profile_url: i.profile_url },
    ]),
  );
  items[84] = item(84, "2");
  const f = fixture(items, seen);
  const result = await syncWorkspace(f.deps);
  assert.equal(result.state, "completed");
  assert.equal(f.reads, 1);
  assert.equal(result.unchanged, 199);
  assert.equal(
    f.calls.find(([c]) => c === "commit_thread")[1].messages[0].direction,
    "outbound",
  );
});
test("listing order does not skip a changed thread behind an old pinned conversation", async () => {
  const f = fixture([item(0), item(1, "2")], {
    "thread-0": { revision: "1", profile_url: item(0).profile_url },
  });
  await syncWorkspace(f.deps);
  assert.equal(f.reads, 1);
});
test("incomplete coverage or mismatched identity cannot advance the global checkpoint", async () => {
  const f = fixture([item(0)]);
  f.deps.readConversation = async () => ({ ...observation(item(1)) });
  const r = await syncWorkspace(f.deps);
  assert.equal(r.state, "failed");
  assert.ok(!f.calls.some(([c]) => c === "finish" || c === "commit_thread"));
  const g = fixture([]);
  g.deps.listConversationPage = async () => ({
    conversations: [],
    complete: false,
  });
  await syncWorkspace(g.deps);
  assert.ok(!g.calls.some(([c]) => c === "finish"));
});
test("busy lease does not start a second shared sync", async () => {
  const f = fixture([]);
  f.deps.rpc = async () => ({});
  assert.equal((await syncWorkspace(f.deps)).state, "busy");
  assert.equal(f.reads, 0);
});
test("Inbox excludes waiting and queued relationships; manual outbound removes a draft from action-needed", () => {
  const now = Date.parse("2026-09-05T06:00:00Z");
  let s = createDemoControlCenter(now);
  assert.equal(inboxNeedsAction(s, "sample-2", now), false);
  assert.equal(inboxNeedsAction(s, "sample-5", now), false);
  assert.equal(inboxNeedsAction(s, "sample-3", now), true);
  s = applyDemoCommand(
    s,
    "manual_message",
    {
      contact_id: "sample-3",
      direction: "outbound",
      body: "Already sent on LinkedIn",
      key: "outside",
    },
    now,
  );
  assert.equal(inboxNeedsAction(s, "sample-3", now), false);
});

test("external observations cannot replace the claimed run or thread revision", async () => {
  const f = fixture([item(0)]);
  f.deps.readConversation = async (i) => ({
    ...observation(i),
    attempt_id: "other",
    thread_id: "other",
    revision: "other",
  });
  await syncWorkspace(f.deps);
  const p = f.calls.find(([c]) => c === "commit_thread")[1];
  assert.equal(p.attempt_id, "run");
  assert.equal(p.thread_id, "thread-0");
  assert.equal(p.revision, "1");
});
test("conflicting duplicate revisions and failed connection phases retain checkpoint", async () => {
  const f = fixture([item(0), item(0, "2")]);
  assert.equal((await syncWorkspace(f.deps)).state, "failed");
  assert.ok(!f.calls.some(([c]) => c === "finish"));
  const g = fixture([item(0)]);
  g.deps.syncConnections = async () => ({ state: "failed" });
  assert.equal((await syncWorkspace(g.deps)).state, "failed");
  assert.equal(g.reads, 0);
});

test('200 unchanged conversation revisions require no thread reads',async()=>{
 const items=Array.from({length:200},(_,i)=>item(i));const seen=Object.fromEntries(items.map(i=>[i.thread_id,{revision:i.revision,profile_url:i.profile_url}]));const f=fixture(items,seen);const result=await syncWorkspace(f.deps);assert.equal(result.state,'completed');assert.equal(f.reads,0);assert.equal(result.unchanged,200);
});
