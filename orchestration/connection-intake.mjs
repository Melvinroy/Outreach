/** Acceptance emails are discovery signals, never a complete conversation. */
const decode = (s) =>
  String(s || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " ")
    .trim();
const normalized = (s) =>
  decode(s).normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
export function canonicalProfile(value) {
  try {
    const u = new URL(decode(value));
    const path = u.pathname.match(/^\/(?:comm\/)?in\/([^/]+)\/?$/i);
    if (
      u.protocol !== "https:" ||
      !/(^|\.)linkedin\.com$/i.test(u.hostname) ||
      !path
    )
      return null;
    return `https://www.linkedin.com/in/${path[1].toLowerCase()}`;
  } catch {
    return null;
  }
}
export function parseGmailAcceptance(email) {
  const headers = email.payload?.headers || [];
  const header = (name) =>
    headers.find((h) => h.name.toLowerCase() === name)?.value || "";
  const subject = header("subject"),
    sender = header("from"),
    auth = header("authentication-results");
  if (!/accepted your (?:invitation|connection)|now connected/i.test(subject))
    return null;
  const authenticated =
    /dmarc=pass\b[\s\S]*?header\.from=linkedin\.com\b/i.test(auth);
  if (!authenticated || !/<[^<>@]+@(?:[\w-]+\.)*linkedin\.com>/i.test(sender))
    return null;
  const name = sender.match(/^"?(.+?)\s+via LinkedIn"?\s*</i)?.[1]?.trim();
  if (!name || !email.id) return null;
  const bodies = [];
  const walk = (p) => {
    if (p?.mime_type === "text/html" && p.body?.content)
      bodies.push(p.body.content);
    for (const child of p?.parts || []) walk(child);
  };
  walk(email.payload);
  const identities = new Set();
  for (const html of bodies)
    for (const anchor of html.matchAll(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    )) {
      const label = decode(
        anchor[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " "),
      );
      const url = canonicalProfile(anchor[1]);
      if (url && normalized(label) === normalized(name)) identities.add(url);
    }
  const date = new Date(Number(email.internal_date));
  return {
    source: "gmail",
    external_key: email.id,
    signal_kind: "acceptance",
    candidate_name: name,
    candidate_profile_url: identities.size === 1 ? [...identities][0] : null,
    occurred_at: Number.isFinite(date.getTime()) ? date.toISOString() : null,
    authenticated_sender: true,
    evidence_summary:
      "Authenticated LinkedIn acceptance notification. Profile and conversation require browser verification.",
  };
}

/** Dependencies are supplied by the verified cloud adapter, never a page timer. */
export async function syncAcceptanceMailbox(
  { rpc, searchEmails, readEmail },
  { maxPages = 100 } = {},
) {
  const run = await rpc("begin_sync", { source: "gmail" });
  if (!run.attempt_id) return { state: "busy" };
  const identity = { source: "gmail", attempt_id: run.attempt_id };
  let page = null,
    pages = 0,
    signals = 0;
  try {
    do {
      const result = await searchEmails({ after: run.after, page_token: page });
      for (const item of result.emails) {
        const signal = parseGmailAcceptance(await readEmail(item.id));
        if (signal) {
          await rpc("ingest_signal", signal);
          signals++;
        }
      }
      page = result.next_page_token || null;
      pages++;
      await rpc("sync_heartbeat", identity);
      if (page && pages >= maxPages)
        throw new Error("Mailbox page limit reached; checkpoint not advanced");
    } while (page);
    await rpc("finish_sync", { ...identity, through: run.started_at, signals });
    return { state: "completed", signals };
  } catch (error) {
    await rpc("fail_sync", {
      ...identity,
      error: String(error.message || error).slice(0, 500),
    });
    return { state: "failed", signals };
  }
}

export async function reconcileNextConnection({ rpc, inspectConnection }) {
  const receipt = await rpc("claim_signal", {});
  if (!receipt.signal) return { state: "idle" };
  const signal = receipt.signal,
    identity = { signal_id: signal.id, attempt_id: signal.attempt_id };
  try {
    // May use Google for identity hints, but final evidence must come from LinkedIn.
    const observation = await inspectConnection(signal, {
      existing_contact: receipt.existing_contact,
      known_history: receipt.known_history,
    });
    if (
      !observation.identity_verified ||
      !observation.complete ||
      observation.relationship !== "connected"
    ) {
      return await rpc("defer_signal", {
        ...identity,
        reason:
          "Profile or complete connected conversation could not be verified",
      });
    }
    return await rpc("resolve_signal", { ...identity, ...observation });
  } catch (error) {
    return await rpc("defer_signal", {
      ...identity,
      reason: String(error.message || error).slice(0, 500),
    });
  }
}

/** Covers connections without an acceptance email, including accepted incoming requests. */
export async function syncRecentLinkedInConnections(
  { rpc, listConnections },
  { maxPages = 100 } = {},
) {
  const run = await rpc("begin_sync", { source: "linkedin" });
  if (!run.attempt_id) return { state: "busy" };
  const identity = { source: "linkedin", attempt_id: run.attempt_id };
  let page = null,
    pages = 0,
    signals = 0;
  try {
    do {
      const result = await listConnections({
        after: run.after,
        page_token: page,
      });
      for (const person of result.connections) {
        const profile = canonicalProfile(person.profile_url);
        if (!profile || !person.full_name)
          throw new Error("Connection listing contains unresolved identities");
        await rpc("ingest_signal", {
          source: "linkedin",
          external_key: `connection:${profile}:${person.connected_at || "first-observed"}`,
          signal_kind: "connection",
          candidate_name: person.full_name,
          candidate_profile_url: profile,
          occurred_at: person.connected_at || null,
          evidence_summary:
            "Observed in signed-in LinkedIn connections; conversation verification pending.",
        });
        signals++;
      }
      page = result.next_page_token || null;
      pages++;
      await rpc("sync_heartbeat", identity);
      if (page && pages >= maxPages)
        throw new Error("Connection listing page limit reached");
      if (!page && result.complete !== true)
        throw new Error("Connection listing coverage is incomplete");
    } while (page);
    await rpc("finish_sync", { ...identity, through: run.started_at, signals });
    return { state: "completed", signals };
  } catch (error) {
    await rpc("fail_sync", {
      ...identity,
      error: String(error.message || error).slice(0, 500),
    });
    return { state: "failed", signals };
  }
}
