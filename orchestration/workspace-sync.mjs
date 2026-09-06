import { canonicalProfile } from "./connection-intake.mjs";

/** One leased run, shared by scheduled/on-demand triggers. No messaging actions.
 * rpc is the durable workspace_sync endpoint. Provider callbacks must report
 * complete coverage, including pinned, archived and other supported inbox views.
 * A timestamp or unread flag alone is NOT a reliable conversation revision. */
export async function syncWorkspace(
  {
    rpc,
    listConversationPage,
    readConversation,
    syncConnections,
    reconcileDueWork,
  },
  { maxPages = 100, maxChangedThreads = 100 } = {},
) {
  const run = await rpc("claim", {});
  if (!run.attempt_id) return { state: "busy" };
  const claim = { attempt_id: run.attempt_id };
  let pages = 0,
    opened = 0,
    unchanged = 0,
    cursor = null;
  const visited = new Set(),
    seen = new Map();
  try {
    // Gmail acceptance signals and new LinkedIn connections use this same run.
    const connections = await syncConnections({
      run_id: run.attempt_id,
      heartbeat: () => rpc("heartbeat", claim),
    });
    if (connections?.state === "failed" || connections?.state === "busy")
      throw new Error("Connection sync did not complete");
    do {
      await rpc("heartbeat", claim);
      const page = await listConversationPage({
        cursor,
        after: run.after,
        include_outbound: true,
        include_archived: true,
      });
      if (!Array.isArray(page.conversations))
        throw new Error("Conversation listing missing");
      for (const item of page.conversations) {
        if (!item.thread_id || !item.revision || item.identity_ambiguous)
          throw new Error(
            "Reliable conversation identity and revision required",
          );
        const profile = canonicalProfile(item.profile_url);
        if (!profile) throw new Error("Conversation profile is unresolved");
        const duplicate = seen.get(item.thread_id);
        if (duplicate) {
          if (
            duplicate.revision !== item.revision ||
            duplicate.profile !== profile
          )
            throw new Error(
              "Conversation changed during pagination; retry required",
            );
          continue;
        }
        seen.set(item.thread_id, { revision: item.revision, profile });
        const prior = run.seen?.[item.thread_id];
        if (
          prior?.revision === item.revision &&
          prior?.profile_url === profile
        ) {
          unchanged++;
          continue;
        }
        if (opened >= maxChangedThreads)
          throw new Error(
            "Changed-thread budget reached; checkpoint retained for continuation",
          );
        await rpc("heartbeat", claim);
        const observation = await readConversation(item, {
          include_inbound: true,
          include_outbound: true,
        });
        if (
          !observation.identity_verified ||
          !observation.complete ||
          !Number.isFinite(Date.parse(observation.observed_at)) ||
          canonicalProfile(observation.profile_url) !== profile ||
          !Array.isArray(observation.messages)
        )
          throw new Error("Complete matching conversation required");
        // Atomic ingestion and revision checkpoint: failed/replayed runs cannot
        // skip a message whose write failed. Changed context revokes approvals.
        await rpc("commit_thread", {
          ...observation,
          ...claim,
          thread_id: item.thread_id,
          revision: item.revision,
          profile_url: profile,
        });
        opened++;
      }
      pages++;
      cursor = page.next_cursor || null;
      if (cursor) {
        if (visited.has(cursor) || pages >= maxPages)
          throw new Error("Incomplete conversation pagination");
        visited.add(cursor);
      } else if (page.complete !== true)
        throw new Error("Conversation listing coverage is incomplete");
    } while (cursor);
    if (reconcileDueWork) await reconcileDueWork({ run_id: run.attempt_id });
    await rpc("route_due", claim);
    await rpc("finish", { ...claim, opened, unchanged });
    return { state: "completed", opened, unchanged, pages };
  } catch (error) {
    await rpc("fail", {
      ...claim,
      error: String(error.message || error).slice(0, 500),
    });
    return {
      state: "failed",
      opened,
      unchanged,
      error: String(error.message || error),
    };
  }
}
