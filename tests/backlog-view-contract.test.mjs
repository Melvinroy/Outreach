import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("outreach queue preserves and exposes recommendations across runs", () => {
  assert.match(page, /fetchAllRuns/);
  assert.match(page, /fetchAllRecommendations/);
  assert.match(page, /\.range\(from, from \+ pageSize - 1\)/);
  assert.doesNotMatch(page, /\.eq\("run_id", runResult/);
  assert.match(page, /latestRecommendationByContact/);
});

test("today remains default while backlog and date views remain reachable", () => {
  assert.match(page, /useState<QueueScope>\("today"\)/);
  for (const label of ["Unreached", "Recent 7 days", "All", "Dates"]) assert.match(page, new RegExp(`>${label}`));
  assert.match(page, /found today/);
  assert.match(page, /unreached/);
  assert.match(page, /sent today/);
  assert.match(page, /type="date"/);
  assert.match(styles, /queue-scope-bar/);
  assert.match(styles, /automation-health\.delayed/);
});

test("catch-up remains supervised and cannot send invitations", () => {
  assert.match(page, /copyCatchUpCommand/);
  assert.match(page, /Do not send any invitations/);
  assert.match(page, /Catch-up command copied/);
});
