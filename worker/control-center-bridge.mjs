const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

/** Request handler usable by a Supabase Edge Function. Secrets stay server-side.
 * A configured provider is not represented as a verified LinkedIn capability. */
export function createControlCenterBridge(env, request = fetch) {
  const base = env.SUPABASE_URL?.replace(/\/$/, "");
  const allowedOrigins = (env.OUTREACH_ALLOWED_ORIGINS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return async function handle(req) {
    const origin = req.headers.get("origin");
    if (origin && !allowedOrigins.includes(origin))
      return json({ error: "Origin not allowed" }, 403);
    const headers = origin
      ? {
          "access-control-allow-origin": origin,
          vary: "Origin",
          "access-control-allow-headers":
            "authorization,apikey,content-type,x-client-info",
          "access-control-allow-methods": "POST,OPTIONS",
        }
      : {};
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST")
      return json({ error: "POST required" }, 405, headers);
    if (!base || !env.SUPABASE_SERVICE_ROLE_KEY)
      return json({ error: "Bridge is not configured" }, 503, headers);
    try {
      const raw = await req.text();
      if (raw.length > 2_000_000)
        return json({ error: "Request too large" }, 413, headers);
      const body = JSON.parse(raw);
      const auth = req.headers.get("authorization") || "";
      if (
        body.operation === "worker" ||
        body.operation === "sync" ||
        body.operation === "inventory" ||
        body.operation === "workspace_sync"
      ) {
        if (
          !env.OUTREACH_AGENT_TOKEN ||
          auth !== `Bearer ${env.OUTREACH_AGENT_TOKEN}`
        )
          return json({ error: "Agent authentication required" }, 401, headers);
        if (
          !(
            body.operation === "workspace_sync"
              ? [
                  "claim",
                  "heartbeat",
                  "commit_thread",
                  "route_due",
                  "finish",
                  "fail",
                ]
              : body.operation === "inventory"
                ? ["observe"]
                : body.operation === "sync"
                  ? [
                      "begin_sync",
                      "sync_heartbeat",
                      "finish_sync",
                      "fail_sync",
                      "ingest_signal",
                      "claim_signal",
                      "defer_signal",
                      "resolve_signal",
                    ]
                  : [
                      "claim",
                      "observe",
                      "draft",
                      "heartbeat",
                      "start_send",
                      "result",
                    ]
          ).includes(body.command)
        )
          return json({ error: "Worker command not allowed" }, 400, headers);
        const response = await request(
          `${base}/rest/v1/rpc/${body.operation === "workspace_sync" ? "workspace_sync" : body.operation === "inventory" ? "record_invitation_inventory" : body.operation === "sync" ? "control_center_sync" : "control_center_worker"}`,
          {
            method: "POST",
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              ...(body.operation === "inventory"
                ? {}
                : { p_command: body.command }),
              p_payload: body.payload || {},
            }),
          },
        );
        return json(await response.json(), response.status, headers);
      }
      if (
        body.operation !== "dispatch" ||
        !/^[0-9a-f-]{36}$/i.test(body.job_id || "")
      )
        return json({ error: "Valid dispatch job required" }, 400, headers);
      const userResponse = await request(`${base}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: auth },
      });
      if (!userResponse.ok)
        return json({ error: "Sign in required" }, 401, headers);
      const user = await userResponse.json();
      const jobResponse = await request(
        `${base}/rest/v1/outreach_jobs?id=eq.${body.job_id}&select=id,requested_by,state`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            authorization: auth,
          },
        },
      );
      if (!jobResponse.ok)
        return json({ error: "Job access denied" }, 403, headers);
      const [job] = await jobResponse.json();
      if (!job || job.requested_by !== user.id)
        return json({ error: "Job access denied" }, 403, headers);
      if (job.state !== "queued")
        return json({ state: job.state, job_id: job.id }, 200, headers);
      if (
        !env.WORKSPACE_AGENT_TRIGGER_ID ||
        !env.WORKSPACE_AGENT_ACCESS_TOKEN
      ) {
        return json(
          {
            state: "queued",
            job_id: job.id,
            dispatch: "not_configured",
            message: "Job saved. Cloud executor connection is pending.",
          },
          202,
          headers,
        );
      }
      if (!/^agtch_[A-Za-z0-9_-]+$/.test(env.WORKSPACE_AGENT_TRIGGER_ID))
        return json(
          { error: "Invalid configured agent trigger" },
          503,
          headers,
        );
      const triggered = await request(
        `https://api.chatgpt.com/v1/workspace_agents/${env.WORKSPACE_AGENT_TRIGGER_ID}/trigger`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.WORKSPACE_AGENT_ACCESS_TOKEN}`,
            "content-type": "application/json",
            "Idempotency-Key": `outreach:${job.id}`,
            "OpenAI-Beta": "workspace_agent_runs=v1",
          },
          body: JSON.stringify({
            conversation_key: `outreach-job:${job.id}`,
            input: `Process Outreach job ${job.id} through the connected control-center worker tools. Fetch the canonical job. Do not approve or change the approved message. Report structured per-person results to the backend. Stop on changed context or uncertain delivery.`,
          }),
        },
      );
      if (!triggered.ok)
        return json(
          {
            state: "queued",
            dispatch: "failed",
            message:
              "Job saved; cloud launch failed. Retry launch with the same job.",
          },
          502,
          headers,
        );
      const result = await triggered.json();
      return json(
        {
          state: "queued",
          dispatch: "accepted",
          job_id: job.id,
          conversation_url: result.conversation_url,
          agent_trigger_run_id: result.agent_trigger_run_id,
        },
        202,
        headers,
      );
    } catch {
      return json(
        {
          error:
            "Request could not be processed; job state must be checked before retrying",
        },
        500,
        headers,
      );
    }
  };
}
