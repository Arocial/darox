import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
  SuggestionEmptyPrefix,
  suggestionQuery,
} from "../components/darox-ui/suggestion-empty-prefix.ts";

const source = readFileSync(
  new URL("../components/darox-ui/command-menu.tsx", import.meta.url),
  "utf8",
);
const hook = ts.transpileModule(
  source.slice(
    source.indexOf("function useSuggestions("),
    source.indexOf("const SuggestionItemRenderer"),
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function harness() {
  const states = [];
  const refs = [];
  const requests = [];
  let stateIndex;
  let refIndex;
  let cleanup;
  let timer;
  const runHook = new Function(
    "useState",
    "useRef",
    "useEffect",
    "daroxFetch",
    "setTimeout",
    "clearTimeout",
    "SuggestionEmptyPrefix",
    "suggestionQuery",
    `${hook}; return useSuggestions;`,
  )(
    (initial) => {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (value) => {
          states[i] = value;
        },
      ];
    },
    (initial) => {
      const i = refIndex++;
      refs[i] ??= { current: initial };
      return refs[i];
    },
    (effect) => {
      cleanup = effect();
    },
    (url, options) =>
      new Promise((resolve, reject) => {
        requests.push({ url, options, resolve, reject });
      }),
    (callback) => {
      timer = callback;
      return callback;
    },
    () => {
      timer = undefined;
    },
    SuggestionEmptyPrefix,
    suggestionQuery,
  );
  return {
    states,
    requests,
    render(
      search,
      {
        command = null,
        open = true,
        agent = "agent",
        node = "node",
        base = "http://localhost",
      } = {},
    ) {
      cleanup?.();
      stateIndex = 0;
      refIndex = 0;
      runHook(command, search, open, agent, node, base);
    },
    fire() {
      const callback = timer;
      timer = undefined;
      return callback?.();
    },
  };
}

const response = (items, ok = true) => ({ ok, json: async () => ({ items }) });
const item = { id: "1", value: "value", label: "Value", description: null };

async function empty(h, search, options) {
  h.render(search, options);
  const pending = h.fire();
  h.requests.at(-1).resolve(response([]));
  await pending;
}

test("empty prefixes skip extensions but reset after deletion or edits", () => {
  const state = new SuggestionEmptyPrefix();
  assert.equal(state.shouldSkip("scope", "abc"), false);
  state.recordEmpty("abc");
  assert.equal(state.shouldSkip("scope", "abc"), true);
  assert.equal(state.shouldSkip("scope", "abcd"), true);
  assert.equal(state.shouldSkip("scope", "ab"), false);
  assert.equal(state.shouldSkip("scope", "abc"), false);
  state.recordEmpty("abc");
  assert.equal(state.shouldSkip("scope", "abd"), false);
});

test("query parsing preserves argument position and preceding text", () => {
  assert.deepEqual(suggestionQuery("/model", "provider abc"), {
    query: "abc",
    argumentPrefix: "provider ",
  });
  assert.deepEqual(suggestionQuery("/model", "provider abc "), {
    query: "",
    argumentPrefix: "provider abc ",
  });
  assert.deepEqual(suggestionQuery(null, "hello world"), {
    query: "hello world",
    argumentPrefix: "hello ",
  });
});

test("hook skips requests after empty results and resumes after backspace", async () => {
  const h = harness();
  await empty(h, "abc");
  h.render("abcd");
  await h.fire();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.states, [[], false]);
  h.render("ab");
  const pending = h.fire();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(response([item]));
  await pending;
  assert.deepEqual(h.states, [[item], false]);
});

test("context changes and new arguments restore requests", async () => {
  for (const options of [
    { command: "/other" },
    { agent: "other" },
    { node: "other" },
    { base: "http://other" },
  ]) {
    const h = harness();
    await empty(h, "abc", { command: "/model" });
    h.render("abcd", { command: "/model", ...options });
    const pending = h.fire();
    assert.equal(h.requests.length, 2);
    h.requests[1].resolve(response([]));
    await pending;
  }
  for (const command of [null, "/model"]) {
    const h = harness();
    await empty(h, "abc", { command });
    h.render("abc ", { command });
    const pending = h.fire();
    assert.equal(h.requests.length, 2);
    assert.equal(
      new URL(h.requests[1].url).searchParams.get("q"),
      command ? null : "abc ",
    );
    h.requests[1].resolve(response([]));
    await pending;
  }
});

test("closing or clearing resets the empty prefix", async () => {
  for (const [search, options] of [
    ["abc", { open: false }],
    ["", {}],
  ]) {
    const h = harness();
    await empty(h, "abc");
    h.render(search, options);
    h.render("abcd");
    const pending = h.fire();
    assert.equal(h.requests.length, 2);
    h.requests[1].resolve(response([]));
    await pending;
  }
});

test("HTTP errors and missing items do not establish empty prefixes", async () => {
  for (const result of [response([], false), response(undefined)]) {
    const h = harness();
    h.render("abc");
    const pending = h.fire();
    h.requests[0].resolve(result);
    await pending;
    h.render("abcd");
    const next = h.fire();
    assert.equal(h.requests.length, 2);
    h.requests[1].resolve(response([]));
    await next;
  }
});

test("cancelled responses cannot replace items or clear a newer loading state", async () => {
  const h = harness();
  h.render("abc");
  const old = h.fire();
  h.render("abcd");
  const current = h.fire();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].resolve(response([]));
  await old;
  assert.equal(h.states[1], true);
  h.requests[1].resolve(response([item]));
  await current;
  assert.deepEqual(h.states, [[item], false]);
  h.render("abcde");
  const next = h.fire();
  assert.equal(h.requests.length, 3);
  h.requests[2].resolve(response([]));
  await next;
});

test("cancellation during JSON parsing cannot establish an empty prefix", async () => {
  const h = harness();
  let finishJson;
  h.render("abc");
  const old = h.fire();
  h.requests[0].resolve({
    ok: true,
    json: () =>
      new Promise((resolve) => {
        finishJson = resolve;
      }),
  });
  await Promise.resolve();
  h.render("abcd");
  finishJson({ items: [] });
  await old;
  const current = h.fire();
  h.requests[1].resolve(response([item]));
  await current;
  h.render("abcde");
  const next = h.fire();
  assert.equal(h.requests.length, 3);
  h.requests[2].resolve(response([]));
  await next;
});

test("editing preceding arguments resets the empty prefix", async () => {
  const h = harness();
  await empty(h, "provider abc", { command: "/model" });
  h.render("other abcd", { command: "/model" });
  const pending = h.fire();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(response([]));
  await pending;
});

test("network errors allow subsequent queries to retry", async (t) => {
  t.mock.method(console, "error", () => {});
  const h = harness();
  h.render("abc");
  const pending = h.fire();
  h.requests[0].reject(new Error("offline"));
  await pending;
  assert.deepEqual(h.states, [[], false]);
  h.render("abcd");
  const next = h.fire();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(response([item]));
  await next;
  assert.deepEqual(h.states, [[item], false]);
});
