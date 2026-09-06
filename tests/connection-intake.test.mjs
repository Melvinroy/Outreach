import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGmailAcceptance,
  syncAcceptanceMailbox,
  reconcileNextConnection,
  syncRecentLinkedInConnections,
} from "../orchestration/connection-intake.mjs";
const email = {
  id: "fixture-email",
  internal_date: "1788588000000",
  payload: {
    mime_type: "text/html",
    headers: [
      {
        name: "From",
        value: "Jamie Example via LinkedIn <invitations@linkedin.com>",
      },
      {
        name: "Subject",
        value: "Jamie accepted your invitation, explore their network",
      },
      {
        name: "Authentication-Results",
        value: "mx.google.com; dmarc=pass header.from=linkedin.com",
      },
    ],
    body: {
      content:
        '<a href="https://www.linkedin.com/comm/in/jamie-example?tracking=discard">Jamie Example</a><a href="https://www.linkedin.com/comm/in/unrelated">Another Person</a>',
    },
  },
};
test("acceptance parser selects the named person, strips tracking, and ignores recommendations", () => {
  const s = parseGmailAcceptance(email);
  assert.equal(
    s.candidate_profile_url,
    "https://www.linkedin.com/in/jamie-example",
  );
  assert.equal(s.external_key, "fixture-email");
  assert.equal(JSON.stringify(s).includes("tracking"), false);
  const spoof = structuredClone(email);
  spoof.payload.headers[2].value = "dmarc=fail header.from=linkedin.com";
  assert.equal(parseGmailAcceptance(spoof), null);
  const ambiguous = structuredClone(email);
  ambiguous.payload.body.content +=
    '<a href="https://www.linkedin.com/in/another-jamie">Jamie Example</a>';
  assert.equal(parseGmailAcceptance(ambiguous).candidate_profile_url, null);
});
test("mailbox cursor advances only after all pages are ingested", async () => {
  const calls = [];
  let pages = 0;
  const result = await syncAcceptanceMailbox({
    rpc: async (cmd, p) => {
      calls.push([cmd, p]);
      return cmd === "begin_sync"
        ? { attempt_id: "a", started_at: "scan-start", after: "prior" }
        : {};
    },
    searchEmails: async () => ({
      emails: [{ id: email.id }],
      next_page_token: ++pages === 1 ? "page2" : null,
    }),
    readEmail: async () => email,
  });
  assert.equal(result.state, "completed");
  assert.equal(pages, 2);
  assert.equal(calls.at(-1)[0], "finish_sync");
  assert.equal(calls.at(-1)[1].through, "scan-start");
});
test("failed mailbox page leaves checkpoint unchanged", async () => {
  const calls = [];
  await syncAcceptanceMailbox({
    rpc: async (cmd) => {
      calls.push(cmd);
      return { attempt_id: "a" };
    },
    searchEmails: async () => {
      throw new Error("offline");
    },
    readEmail: async () => email,
  });
  assert.equal(calls.includes("finish_sync"), false);
  assert.equal(calls.at(-1), "fail_sync");
});
test("connection reconciliation cannot create a person from incomplete browser history", async () => {
  const calls = [];
  await reconcileNextConnection({
    rpc: async (cmd) => {
      calls.push(cmd);
      return { signal: { id: "s", attempt_id: "a" } };
    },
    inspectConnection: async () => ({
      identity_verified: true,
      complete: false,
      relationship: "connected",
    }),
  });
  assert.deepEqual(calls, ["claim_signal", "defer_signal"]);
});

test("LinkedIn reconciliation covers a new connection without an email and refuses incomplete checkpoints", async () => {
  const calls = [];
  const r = await syncRecentLinkedInConnections({
    rpc: async (cmd, p) => {
      calls.push([cmd, p]);
      return { attempt_id: "a", started_at: "start" };
    },
    listConnections: async () => ({
      connections: [
        {
          full_name: "Jamie Example",
          profile_url: "https://linkedin.com/in/jamie-example",
        },
      ],
      complete: false,
    }),
  });
  assert.equal(r.state, "failed");
  assert.equal(
    calls.find(([c]) => c === "ingest_signal")[1].source,
    "linkedin",
  );
  assert.equal(
    calls.some(([c]) => c === "finish_sync"),
    false,
  );
});
