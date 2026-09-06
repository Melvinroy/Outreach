import test from "node:test";
import assert from "node:assert/strict";
import { runControlCenterJob } from "../orchestration/control-center-runner.mjs";
import { createControlCenterBridge } from "../worker/control-center-bridge.mjs";

const job = {
  id: "job",
  kind: "send",
  attempt_id: "attempt",
  claim_version: 1,
};
test("withdrawal preparation verifies the relationship without generating a message or acting", async () => {
  const calls = [];
  await runControlCenterJob({
    rpc: async (cmd, p) => {
      calls.push(cmd);
      if (cmd === "claim")
        return {
          job: { ...job, kind: "prepare" },
          contact: {},
          action: { intent: "withdrawal" },
        };
      if (cmd === "draft") assert.equal(p.text, "");
      return { state: "checking" };
    },
    readThread: async (_contact, options) => {
      assert.equal(options.intent, "withdrawal");
      return { complete: true, relationship: "request_sent" };
    },
    draft: () => assert.fail("Withdrawal generated a message"),
    performAction: () => assert.fail("Preparation withdrew invitation"),
  });
  assert.deepEqual(calls, ["claim", "observe", "draft"]);
});
test("changed live thread stops before send", async () => {
  let sends = 0;
  const result = await runControlCenterJob({
    rpc: async (cmd) =>
      cmd === "claim" ? { job, contact: {} } : { state: "context_changed" },
    readThread: async () => ({ complete: true }),
    performAction: async () => sends++,
  });
  assert.equal(sends, 0);
  assert.equal(result.state, "context_changed");
});
test("failure after action starts is uncertain, never retried", async () => {
  const calls = [];
  let sends = 0;
  const result = await runControlCenterJob({
    rpc: async (cmd, p) => {
      calls.push([cmd, p]);
      if (cmd === "claim") return { job, contact: {} };
      if (cmd === "start_send") return { message_text: "Exact approved text" };
      return p || { state: "checking" };
    },
    readThread: async () => ({ complete: true }),
    performAction: async ({ message_text }) => {
      assert.equal(message_text, "Exact approved text");
      sends++;
      throw new Error("Browser lost after click");
    },
  });
  assert.equal(sends, 1);
  assert.equal(result.outcome, "outcome_uncertain");
  assert.equal(calls.at(-1)[0], "result");
});
test("preparation cannot call send or approval", async () => {
  const calls = [];
  await runControlCenterJob({
    rpc: async (cmd, p) => {
      calls.push(cmd);
      return cmd === "claim"
        ? { job: { ...job, kind: "prepare" }, contact: {} }
        : p || {};
    },
    readThread: async () => ({ complete: true }),
    draft: async () => "A draft",
    performAction: () => assert.fail("sent"),
  });
  assert.deepEqual(calls, ["claim", "observe", "draft"]);
});
test("unconfigured dispatch preserves queued work without pretending to run", async () => {
  const handle = createControlCenterBridge(
    {
      SUPABASE_URL: "https://db.example",
      SUPABASE_SERVICE_ROLE_KEY: "server-only",
    },
    async (url) =>
      new Response(
        JSON.stringify(
          url.includes("/auth/")
            ? { id: "owner" }
            : [
                {
                  id: "10000000-0000-0000-0000-000000000001",
                  requested_by: "owner",
                  state: "queued",
                },
              ],
        ),
        { status: 200 },
      ),
  );
  const response = await handle(
    new Request("https://bridge.example", {
      method: "POST",
      headers: { authorization: "Bearer user-token" },
      body: JSON.stringify({
        operation: "dispatch",
        job_id: "10000000-0000-0000-0000-000000000001",
      }),
    }),
  );
  assert.equal(response.status, 202);
  assert.equal((await response.json()).dispatch, "not_configured");
});
test("user cannot call worker endpoint", async () => {
  const handle = createControlCenterBridge(
    {
      SUPABASE_URL: "https://db.example",
      SUPABASE_SERVICE_ROLE_KEY: "server-only",
      OUTREACH_AGENT_TOKEN: "agent-only",
    },
    async () => assert.fail("unauthenticated backend request"),
  );
  const response = await handle(
    new Request("https://bridge.example", {
      method: "POST",
      headers: { authorization: "Bearer user-token" },
      body: JSON.stringify({ operation: "worker", command: "start_send" }),
    }),
  );
  assert.equal(response.status, 401);
});

test("shared sync endpoint requires agent authentication and rejects messaging commands", async () => {
  const requests = [];
  const handle = createControlCenterBridge(
    {
      SUPABASE_URL: "https://db.example",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      OUTREACH_AGENT_TOKEN: "agent",
    },
    async (url, options) => {
      requests.push([url, JSON.parse(options.body)]);
      return new Response("{}", { status: 200 });
    },
  );
  const request = (command, token) =>
    handle(
      new Request("https://bridge.example", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          operation: "workspace_sync",
          command,
          payload: { attempt_id: "fixture" },
        }),
      }),
    );
  assert.equal((await request("claim", "browser")).status, 401);
  assert.equal((await request("start_send", "agent")).status, 400);
  assert.equal((await request("claim", "agent")).status, 200);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], "https://db.example/rest/v1/rpc/workspace_sync");
  assert.equal(requests[0][1].p_command, "claim");
});
