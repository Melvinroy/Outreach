import { Annotation, END, MemorySaver, START, StateGraph, interrupt } from "@langchain/langgraph";

const Phase4State = Annotation.Root({
  workflowType: Annotation(),
  signal: Annotation({ default: () => null, reducer: (_, next) => next }),
  tasks: Annotation({ default: () => [], reducer: (_, next) => next }),
  batch: Annotation({ default: () => null, reducer: (_, next) => next }),
  commandApproved: Annotation({ default: () => false, reducer: (_, next) => next }),
  status: Annotation({ default: () => "running", reducer: (_, next) => next }),
  audit: Annotation({ default: () => [], reducer: (current, next) => [...current, ...next] }),
});

export function buildPhase4Graph(dependencies, checkpointer = new MemorySaver()) {
  const reconcileSignal = async (state) => {
    if (!state.signal) return { audit: ["No reconciliation signal supplied."] };
    const result = await dependencies.reconcileSignal(state.signal);
    return { audit: [`Reconciled ${result.state} signal.`] };
  };

  const refreshTasks = async () => {
    const tasks = await dependencies.refreshTasks();
    return { tasks, audit: [`Loaded ${tasks.length} due relationship tasks.`] };
  };

  const awaitBatchCommand = (state) => {
    const approval = interrupt({
      kind: "run_phase4_batch",
      actionType: state.batch?.actionType,
      batchCode: state.batch?.code,
      selectedCount: state.batch?.selectedCount,
      instruction: "One explicit voice or text command authorizes this exact frozen batch.",
    });
    return { commandApproved: approval === true, status: approval === true ? "running" : "waiting_for_user" };
  };

  const executeBatch = async (state) => {
    if (!state.commandApproved) return { status: "waiting_for_user", audit: ["Batch was not authorized."] };
    const result = await dependencies.executeBatch(state.batch);
    return { status: result.status, audit: [`Batch finished with ${result.status}.`] };
  };

  return new StateGraph(Phase4State)
    .addNode("reconcile_signal", reconcileSignal)
    .addNode("refresh_tasks", refreshTasks)
    .addNode("await_batch_command", awaitBatchCommand)
    .addNode("execute_batch", executeBatch)
    .addConditionalEdges(START, (state) => state.workflowType === "acceptance_reconciliation" ? "reconcile_signal" : "refresh_tasks")
    .addEdge("reconcile_signal", "refresh_tasks")
    .addConditionalEdges("refresh_tasks", (state) => state.batch ? "await_batch_command" : END)
    .addEdge("await_batch_command", "execute_batch")
    .addEdge("execute_batch", END)
    .compile({ checkpointer });
}

export { Phase4State };
