/** Provider-neutral executor. Browser/draft capabilities must be supplied by a
 * verified cloud integration. This module never approves a message. */
export async function runControlCenterJob(
  { rpc, readThread, draft, performAction, verifyAction },
  jobId,
) {
  const receipt = await rpc("claim", jobId ? { job_id: jobId } : {});
  if (!receipt.job) return { state: "idle", reason: receipt.reason };
  const { job, contact } = receipt;
  const identity = {
    job_id: job.id,
    attempt_id: job.attempt_id,
    claim_version: job.claim_version,
  };
  let actionStarted = false;
  try {
    const observation = await readThread(contact, {
      purpose: job.kind,
      intent: receipt.action?.intent,
      approved: receipt.approval,
      known_history: receipt.known_history,
    });
    if (!observation.complete) {
      return await rpc("result", {
        ...identity,
        event_key: `incomplete:${job.claim_version}`,
        outcome: "not_eligible",
        evidence: { reason: "Thread history is incomplete" },
      });
    }
    const checked = await rpc("observe", { ...identity, ...observation });
    if (checked.state === "context_changed") return checked;
    if (job.kind === "prepare") {
      const text =
        receipt.action?.intent === "withdrawal"
          ? ""
          : await draft({
              contact,
              action: receipt.action,
              preferences: receipt.preferences,
              recommendations: receipt.recommendations,
              observation,
            });
      return await rpc("draft", { ...identity, text });
    }
    if (job.kind !== "send") throw new Error("Unsupported job kind");
    // Server rechecks exact approval, current context, claim and kill switch.
    const approved = await rpc("start_send", identity);
    actionStarted = true;
    await performAction({ contact, ...approved });
    const evidence = await verifyAction({ contact, ...approved });
    if (!evidence?.visible_confirmation)
      throw new Error("Visible confirmation unavailable");
    return await rpc("result", {
      ...identity,
      event_key: `visible:${job.claim_version}`,
      outcome: "sent_confirmed",
      evidence,
    });
  } catch (error) {
    const outcome = actionStarted
      ? "outcome_uncertain"
      : error?.code === "AUTH_REQUIRED"
        ? "blocked_auth"
        : "failed_before_action";
    // If the callback also fails, propagate uncertainty. Never retry the click.
    try {
      return await rpc("result", {
        ...identity,
        event_key: `failure:${job.claim_version}`,
        outcome,
        evidence: { reason: String(error?.message || error).slice(0, 1000) },
      });
    } catch (callbackError) {
      return {
        state: actionStarted ? "uncertain" : "needs_reconciliation",
        job_id: job.id,
        error: String(callbackError?.message || callbackError),
      };
    }
  }
}
