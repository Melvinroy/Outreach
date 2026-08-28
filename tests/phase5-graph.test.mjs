import assert from "node:assert/strict";
import test from "node:test";
import { buildPhase5Graph } from "../orchestration/phase5-graph.mjs";

test("inbound messages cancel the proactive route before drafting", async () => {
  let cancelled = 0;
  const graph = buildPhase5Graph({
    cancelProactiveFollowUp: async () => { cancelled += 1; },
    readConversation: async () => "Please send your resume.",
    draftReply: async ({ inboundMessage }) => `Reply to: ${inboundMessage}`,
    persistApproval: async () => {},
  });
  const threadId = "phase5-inbound";
  await graph.invoke(
    { eventType: "message_received", contactId: "contact-1", inboundSignal: { id: "gmail-1" } },
    { configurable: { thread_id: threadId } },
  );
  const result = await graph.invoke(
    new (await import("@langchain/langgraph")).Command({ resume: { approved: true, message: "Thanks, I will send it." } }),
    { configurable: { thread_id: threadId } },
  );
  assert.equal(cancelled, 1);
  assert.equal(result.route, "inbound_reply");
  assert.equal(result.approved, true);
  assert.match(result.audit.join(" "), /superseded proactive/i);
});

test("silent acceptances never read LinkedIn before a draft review", async () => {
  let readCount = 0;
  const graph = buildPhase5Graph({
    cancelProactiveFollowUp: async () => {},
    readConversation: async () => { readCount += 1; return "unexpected"; },
    draftReply: async () => "Thanks for connecting.",
    persistApproval: async () => {},
  });
  const result = await graph.invoke(
    { eventType: "grace_period_elapsed", contactId: "contact-2", inboundSignal: null },
    { configurable: { thread_id: "phase5-silent" } },
  );
  assert.equal(readCount, 0);
  assert.equal(result.route, "proactive_follow_up");
  assert.equal(result.draft, "Thanks for connecting.");
  assert.equal(result.__interrupt__.length, 1);
});
