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

test("20/10/10: folding starts strictly above 20 inputs and preserves the latest 10", () => {
  assert.equal(initialHistoryCount(0), 0);
  assert.equal(initialHistoryCount(20), 0);
  assert.equal(initialHistoryCount(21), 11);
  const inputs = buildInputIndex(conversation(21));
  const sections = buildHistorySections(
    inputs,
    initialHistoryCount(inputs.length),
  );
  assert.deepEqual(sections, [
    { id: "input-0", start: 0, end: 20, firstInput: 1, lastInput: 10 },
    { id: "input-10", start: 20, end: 22, firstInput: 11, lastInput: 11 },
  ]);
  assert.equal(inputs.length - sections.at(-1).lastInput, 10);
});

test("sections are stable as new inputs arrive during the same visit", () => {
  const original = buildInputIndex(conversation(31));
  const count = initialHistoryCount(original.length);
  assert.deepEqual(
    buildHistorySections(buildInputIndex(conversation(35)), count),
    buildHistorySections(original, count),
  );
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
    assert.ok(section.lastInput - section.firstInput < 10);
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
  assert.deepEqual(buildHistorySections(inputs, 30), [
    { id: "input-0", start: 0, end: 2, firstInput: 1, lastInput: 1 },
  ]);
});
