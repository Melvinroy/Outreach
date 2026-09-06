import test from "node:test";
import assert from "node:assert/strict";
import {
  diagnosticText,
  connectionStatus,
  sendingStatus,
  validateInvitationPreferences,
} from "../lib/settings-status.mjs";

test("diagnostics redact credentials while retaining failure context", () => {
  for (const error of [
    "Failed: Bearer secret-value",
    'Failed: {"access_token":"secret-value"}',
    "Failed: https://example.test/?api_key=secret-value&state=failed",
    "Failed: https://user:secret-value@example.test/",
    "Failed: Basic secret-value",
  ]) {
    assert.ok(diagnosticText(error).includes("Failed:"));
    assert.ok(!diagnosticText(error).includes("secret-value"));
  }
});

const completed = {
  state: "completed",
  last_success_at: "2026-09-06T08:00:00Z",
};
test("sync failure and incomplete work override a previous success", () => {
  assert.equal(
    connectionStatus([
      completed,
      { state: "failed", last_success_at: completed.last_success_at },
    ]),
    "Needs attention",
  );
  assert.equal(
    connectionStatus([{ ...completed, error: "Access expired" }]),
    "Needs attention",
  );
  assert.equal(
    connectionStatus([completed, { state: "partial" }]),
    "Needs attention",
  );
  assert.equal(connectionStatus([completed, { state: "running" }]), "Syncing");
});
test("unknown and sample connections never imply verified access", () => {
  assert.equal(connectionStatus([]), "Not verified");
  assert.equal(connectionStatus([{ state: "completed" }]), "Not verified");
  assert.equal(
    connectionStatus([{ ...completed, last_success_at: "invalid" }]),
    "Not verified",
  );
  assert.equal(connectionStatus([completed], true), "Not verified");
  assert.equal(connectionStatus([completed]), "Up to date");
});
test("sending status requires configured execution and honors a backend pause", () => {
  assert.equal(
    sendingStatus({ adapter: "demo", outbound_enabled: true }),
    "Unavailable",
  );
  assert.equal(
    sendingStatus({ adapter: "cloud", outbound_enabled: true }, true),
    "Unavailable",
  );
  assert.equal(
    sendingStatus({ adapter: "cloud", outbound_enabled: false }),
    "Paused",
  );
  assert.equal(
    sendingStatus({ adapter: "cloud", outbound_enabled: true }),
    "Available",
  );
});
test("invitation form validates policy boundaries and optional threshold", () => {
  for (const days of ["", "6", "91", "8.5"])
    assert.ok(validateInvitationPreferences(days, "", "warn"));
  for (const threshold of ["0", "-1", "1.5"])
    assert.ok(validateInvitationPreferences("14", threshold, "hold"));
  assert.ok(validateInvitationPreferences("14", "", "send"));
  assert.equal(validateInvitationPreferences("7", "", "warn"), "");
  assert.equal(validateInvitationPreferences("90", "100", "cleanup"), "");
});
