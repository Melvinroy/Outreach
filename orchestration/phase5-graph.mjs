import { Annotation, END, MemorySaver, START, StateGraph, interrupt } from "@langchain/langgraph";

const Phase5State = Annotation.Root({
  eventType: Annotation(),
  contactId: Annotation(),
  inboundSignal: Annotation({ default: () => null, reducer: (_, next) => next }),
  inboundMessage: Annotation({ default: () => null, reducer: (_, next) => next }),
  draft: Annotation({ default: () => null, reducer: (_, next) => next }),
  approved: Annotation({ default: () => false, reducer: (_, next) => next }),
  route: Annotation({ default: () => null, reducer: (_, next) => next }),
  status: Annotation({ default: () => "running", reducer: (_, next) => next }),
  audit: Annotation({ default: () => [], reducer: (current, next) => [...current, ...next] }),
});

export function buildPhase5Graph(dependencies, checkpointer = new MemorySaver()) {
  const routeRelationship = async (state) => {
    const hasInbound = Boolean(state.inboundSignal);
    if (hasInbound) await dependencies.cancelProactiveFollowUp(state.contactId);
    return {
      route: hasInbound ? "inbound_reply" : "proactive_follow_up",
      audit: [hasInbound ? "Inbound message superseded proactive follow-up." : "No inbound message; proactive follow-up route selected."],
    };
  };

  const readConversation = async (state) => {
    const inboundMessage = await dependencies.readConversation(state.contactId, state.inboundSignal);
    return { inboundMessage, audit: ["Verified the visible LinkedIn conversation before drafting."] };
  };

  const draftReply = async (state) => ({
    draft: await dependencies.draftReply({
      contactId: state.contactId,
      route: state.route,
      inboundMessage: state.inboundMessage,
    }),
    audit: [`Prepared ${state.route === "inbound_reply" ? "contextual reply" : "proactive follow-up"} draft.`],
  });

  const awaitReview = (state) => {
    const review = interrupt({
      kind: "review_phase5_message",
      route: state.route,
      contactId: state.contactId,
      draft: state.draft,
      instruction: "Review or edit the exact message before it can be queued for LinkedIn.",
    });
    return {
      approved: review?.approved === true,
      draft: typeof review?.message === "string" ? review.message : state.draft,
      status: review?.approved === true ? "approved" : "waiting_for_user",
      audit: [review?.approved === true ? "Draft approved by user." : "Draft remains unapproved."],
    };
  };

  const persistApproval = async (state) => {
    if (!state.approved) return { status: "waiting_for_user" };
    await dependencies.persistApproval({ contactId: state.contactId, route: state.route, message: state.draft });
    return { status: "completed", audit: ["Approved draft persisted for a supervised browser batch."] };
  };

  return new StateGraph(Phase5State)
    .addNode("route_relationship", routeRelationship)
    .addNode("read_conversation", readConversation)
    .addNode("draft_reply", draftReply)
    .addNode("await_review", awaitReview)
    .addNode("persist_approval", persistApproval)
    .addEdge(START, "route_relationship")
    .addConditionalEdges("route_relationship", (state) => state.route === "inbound_reply" ? "read_conversation" : "draft_reply")
    .addEdge("read_conversation", "draft_reply")
    .addEdge("draft_reply", "await_review")
    .addConditionalEdges("await_review", (state) => state.approved ? "persist_approval" : END)
    .addEdge("persist_approval", END)
    .compile({ checkpointer });
}

export { Phase5State };
