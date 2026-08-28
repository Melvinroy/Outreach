import assert from "node:assert/strict";
import test from "node:test";
import { buildPhase4Graph } from "../orchestration/phase4-graph.mjs";

test("task refresh completes without opening a browser when no batch is selected", async () => {
  const graph = buildPhase4Graph({
    reconcileSignal: async () => ({ state: "accepted" }),
    refreshTasks: async () => [{ id: 1, taskType: "follow_up" }],
    executeBatch: async () => { throw new Error("browser execution must not run"); },
  });
  const result = await graph.invoke(
    { workflowType: "task_refresh", batch: null },
    { configurable: { thread_id: "phase4-refresh-test" } },
  );
  assert.equal(result.tasks.length, 1);
  assert.equal(result.commandApproved, false);
  assert.match(result.audit.join(" "), /Loaded 1 due/);
});

test("ambiguous Gmail evidence remains a reconciliation result, not a send", async () => {
  let executeCount = 0;
  const graph = buildPhase4Graph({
    reconcileSignal: async () => ({ state: "ambiguous" }),
    refreshTasks: async () => [],
    executeBatch: async () => { executeCount += 1; return { status: "completed" }; },
  });
  const result = await graph.invoke(
    { workflowType: "acceptance_reconciliation", signal: { source: "gmail_signal" }, batch: null },
    { configurable: { thread_id: "phase4-ambiguous-test" } },
  );
  assert.equal(executeCount, 0);
  assert.match(result.audit.join(" "), /ambiguous/);
});
