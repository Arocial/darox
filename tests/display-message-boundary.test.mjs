import assert from "node:assert/strict";
import { test } from "node:test";
import { displayMessageBoundary } from "../components/darox-ui/display-message-boundary.ts";

test("events inside a joined response appear after the joined message", () => {
  const sourceCounts = [1, 2, 1];
  assert.equal(displayMessageBoundary(0, sourceCounts), 0);
  assert.equal(displayMessageBoundary(1, sourceCounts), 1);
  assert.equal(displayMessageBoundary(2, sourceCounts), 2);
  assert.equal(displayMessageBoundary(3, sourceCounts), 2);
  assert.equal(displayMessageBoundary(4, sourceCounts), 3);
});

test("events at the end stay after the response when its source count grows", () => {
  assert.equal(displayMessageBoundary(2, [1, 1]), 2);
  assert.equal(displayMessageBoundary(2, [1, 2]), 2);
  assert.equal(displayMessageBoundary(3, [1, 2]), 2);
});

test("messages without source entries do not shift command placement", () => {
  assert.equal(displayMessageBoundary(1, [1, 0]), 1);
});
