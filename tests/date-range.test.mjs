import test from "node:test";
import assert from "node:assert/strict";
import { localDateKey, selectRangeDay } from "../lib/date-range.mjs";

test("range takes two clicks, then starts fresh", () => {
  const first = selectRangeDay({ from: "", to: "" }, "2026-09-08");
  assert.deepEqual(first, { from: "2026-09-08", to: "" });
  const second = selectRangeDay(first, "2026-09-11");
  assert.deepEqual(second, { from: "2026-09-08", to: "2026-09-11" });
  assert.deepEqual(selectRangeDay(second, "2026-09-15"), { from: "2026-09-15", to: "" });
});
test("reverse, same-day and cross-month ranges are inclusive", () => {
  assert.deepEqual(selectRangeDay({ from: "2026-10-02", to: "" }, "2026-09-29"), { from: "2026-09-29", to: "2026-10-02" });
  assert.deepEqual(selectRangeDay({ from: "2026-09-08", to: "" }, "2026-09-08"), { from: "2026-09-08", to: "2026-09-08" });
});
test("date keys retain the local calendar day", () => {
  assert.equal(localDateKey(new Date(2026, 8, 8, 0, 1)), "2026-09-08");
});
