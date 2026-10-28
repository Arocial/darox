import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHistorySections,
  buildInputIndex,
  initialHistoryCount,
} from "../components/darox-ui/thread-history-model.ts";

const conversation = (count) =>
  Array.from({ length: count }, (_, i) => [
    {
      id: `input-${i}`,
      role: "user",
      content: [{ type: "text", text: `Question ${i + 1}` }],
    },
    {
      id: `reply-${i}`,
      role: "assistant",
      content: [{ type: "text", text: "Response" }],
    },
  ]).flat();

test("20/10/10: only complete groups fold, retaining at least ten recent inputs", () => {
  for (const [total, folded] of [
    [0, 0],
    [20, 0],
    [21, 10],
    [29, 10],
    [30, 20],
    [33, 20],
    [39, 20],
    [40, 30],
  ]) {
    assert.equal(initialHistoryCount(total), folded, `total inputs: ${total}`);
  }
  const inputs = buildInputIndex(conversation(33));
  assert.deepEqual(
    buildHistorySections(inputs, initialHistoryCount(inputs.length)),
    [
      { id: "input-0", start: 0, end: 20, firstInput: 1, lastInput: 10 },
      { id: "input-10", start: 20, end: 40, firstInput: 11, lastInput: 20 },
    ],
  );
});

test("continuous conversations advance by complete groups while existing section IDs stay stable", () => {
  let previous = [];
  const expanded = new Set(["input-0"]);
  for (const total of [20, 21, 29, 30, 33, 39, 40, 50]) {
    const inputs = buildInputIndex(conversation(total));
    const sections = buildHistorySections(inputs, initialHistoryCount(total));
    assert.deepEqual(sections.slice(0, previous.length), previous);
    if (sections.length > 0) assert.ok(total - sections.at(-1).lastInput >= 10);
    assert.ok(expanded.has("input-0"));
    previous = sections;
  }
});

test("deferred folding can catch up without producing partial groups", () => {
  const inputs = buildInputIndex(conversation(43));
  const deferred = buildHistorySections(inputs, initialHistoryCount(21));
  assert.equal(deferred.at(-1).lastInput, 10);
  const caughtUp = buildHistorySections(inputs, initialHistoryCount(43));
  assert.equal(caughtUp.at(-1).lastInput, 30);
  assert.deepEqual(caughtUp[0], deferred[0]);
});

test("all message indices are covered exactly once, including leading messages and consecutive inputs", () => {
  const messages = [
    { id: "leading", role: "assistant", content: [] },
    ...conversation(25),
  ];
  messages.splice(10, 0, { id: "extra-user", role: "user", content: [] });
  const inputs = buildInputIndex(messages);
  const sections = buildHistorySections(
    inputs,
    initialHistoryCount(inputs.length),
  );
  const ranges = [
    ...sections,
    { start: sections.at(-1).end, end: messages.length },
  ];
  assert.deepEqual(
    ranges.flatMap(({ start, end }) =>
      Array.from({ length: end - start }, (_, i) => start + i),
    ),
    messages.map((_, i) => i),
  );
  for (const section of sections) {
    assert.equal(messages[section.end].role, "user");
    assert.equal(section.lastInput - section.firstInput + 1, 10);
  }
});

test("input index excludes assistant output and provides attachment fallbacks", () => {
  const inputs = buildInputIndex([
    {
      id: "a",
      role: "assistant",
      content: [{ type: "text", text: "Not an input" }],
    },
    {
      id: "u",
      role: "user",
      content: [
        { type: "text", text: " first " },
        { type: "text", text: "second " },
      ],
    },
    {
      id: "f",
      role: "user",
      content: [],
      attachments: [{ name: "screen.png" }],
    },
    { id: "empty", role: "user", content: [] },
  ]);
  assert.deepEqual(
    inputs.map(({ id, ordinal, messageIndex, text }) => ({
      id,
      ordinal,
      messageIndex,
      text,
    })),
    [
      { id: "u", ordinal: 1, messageIndex: 1, text: "first \nsecond" },
      { id: "f", ordinal: 2, messageIndex: 2, text: "Attachment · screen.png" },
      { id: "empty", ordinal: 3, messageIndex: 3, text: "Attachment input" },
    ],
  );
});

test("short or replaced snapshots cannot produce an out-of-bounds section", () => {
  assert.deepEqual(buildHistorySections([], 30), []);
  const inputs = buildInputIndex(conversation(2));
  assert.deepEqual(buildHistorySections(inputs, 30), []);
  const longer = buildInputIndex(conversation(25));
  assert.deepEqual(buildHistorySections(longer, 99), [
    { id: "input-0", start: 0, end: 20, firstInput: 1, lastInput: 10 },
  ]);
  assert.deepEqual(buildHistorySections(longer, 9), []);
});
