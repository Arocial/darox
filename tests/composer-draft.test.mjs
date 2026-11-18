import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bindComposerDraft,
  composerDraftKey,
} from "../components/darox-ui/composer-draft.ts";

function harness(storage, key, initialText = "") {
  let text = initialText;
  const listeners = new Set();
  const composer = {
    getState: () => ({ text }),
    setText(value) {
      text = value;
      for (const listener of listeners) listener();
    },
  };
  const unsubscribe = bindComposerDraft(storage, key, composer, (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
  return { composer, unsubscribe };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, text) => values.set(key, text),
    removeItem: (key) => values.delete(key),
  };
}

test("drafts save synchronously and restore exact unsent text after reload", () => {
  const storage = memoryStorage();
  const key = composerDraftKey("manager:profile", "root/child");
  const first = harness(storage, key);
  const text = "  unfinished\n中文输入  ";
  first.composer.setText(text);
  assert.equal(storage.getItem(key), text);
  first.unsubscribe();
  const reloaded = harness(storage, key);
  assert.equal(reloaded.composer.getState().text, text);
  reloaded.composer.setText("");
  assert.equal(storage.getItem(key), null);
  assert.equal(harness(storage, key).composer.getState().text, "");
});

test("draft identities isolate Managers, profiles, sessions, and nested agents", () => {
  const keys = [
    ["one:coder", "root"],
    ["two:coder", "root"],
    ["one:other", "root"],
    ["one:coder", "root/child"],
    ["one:coder", "other/child"],
  ].map(([backend, path]) => composerDraftKey(backend, path));
  assert.equal(new Set(keys).size, keys.length);
  const storage = memoryStorage();
  keys.forEach((key, i) => {
    harness(storage, key).composer.setText(`draft ${i}`);
  });
  keys.forEach((key, i) => {
    assert.equal(harness(storage, key).composer.getState().text, `draft ${i}`);
  });
});

test("existing runtime text is not overwritten and failed sends preserve drafts", () => {
  const storage = memoryStorage();
  storage.setItem("draft", "saved");
  const { composer, unsubscribe } = harness(storage, "draft", "current");
  assert.equal(composer.getState().text, "current");
  composer.setText("unsent after failure");
  assert.equal(storage.getItem("draft"), "unsent after failure");
  unsubscribe();
  composer.setText("unmounted");
  assert.equal(storage.getItem("draft"), "unsent after failure");
});

test("blocked or full browser storage does not break typing or reset", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("quota");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  const { composer } = harness(storage, "draft");
  assert.doesNotThrow(() => composer.setText("hello"));
  assert.doesNotThrow(() => composer.setText(""));
});
