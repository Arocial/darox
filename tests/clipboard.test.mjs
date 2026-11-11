import assert from "node:assert/strict";
import { test } from "node:test";
import { copyTextToClipboard } from "../lib/clipboard.ts";

const setGlobal = (t, name, value) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
};

const mockBrowser = (t, { clipboard, copy = () => true } = {}) => {
  const calls = [];
  const originalRanges = [{ id: "first" }, { id: "second" }];
  let ranges = originalRanges.map((range) => ({
    cloneRange() {
      calls.push("clone");
      return range;
    },
  }));
  const selection = {
    get rangeCount() {
      return ranges.length;
    },
    getRangeAt(index) {
      return ranges[index];
    },
    removeAllRanges() {
      calls.push("clear selection");
      ranges = [];
    },
    addRange(range) {
      calls.push("restore range");
      ranges.push(range);
    },
  };
  class HTMLElement {
    focus(options) {
      calls.push(["focus", options]);
      document.activeElement = this;
    }
  }
  const activeElement = new HTMLElement();
  let attached = false;
  const textarea = {
    style: {},
    select() {
      assert.equal(attached, true);
      calls.push("select");
      document.activeElement = textarea;
      ranges = [];
    },
    remove() {
      calls.push("remove");
      attached = false;
    },
  };
  const document = {
    activeElement,
    getSelection: () => selection,
    createElement(tag) {
      assert.equal(tag, "textarea");
      calls.push("create");
      return textarea;
    },
    body: {
      appendChild(element) {
        assert.equal(element, textarea);
        assert.equal(attached, false);
        calls.push("append");
        attached = true;
      },
    },
    execCommand(command) {
      assert.equal(command, "copy");
      assert.equal(attached, true);
      assert.ok(calls.includes("select"));
      calls.push("copy");
      return copy();
    },
  };
  setGlobal(t, "navigator", clipboard ? { clipboard } : {});
  setGlobal(t, "document", document);
  setGlobal(t, "HTMLElement", HTMLElement);
  return {
    calls,
    document,
    textarea,
    assertRestored() {
      assert.equal(attached, false, "temporary textarea is removed");
      assert.equal(document.activeElement, activeElement);
      assert.deepEqual(ranges, originalRanges);
      assert.deepEqual(
        calls.filter((call) => Array.isArray(call)),
        [["focus", { preventScroll: true }]],
      );
      assert.ok(calls.indexOf("remove") < calls.indexOf("clear selection"));
    },
  };
};

test("clipboard uses the modern API without touching the document", async (t) => {
  const writes = [];
  const clipboard = {
    async writeText(text) {
      assert.equal(this, clipboard);
      writes.push(text);
    },
  };
  setGlobal(t, "navigator", { clipboard });
  setGlobal(t, "document", undefined);
  const text = "A response\nwith Unicode: café 🦊";
  assert.equal(await copyTextToClipboard(text), undefined);
  assert.deepEqual(writes, [text]);
});

for (const [name, clipboard] of [
  ["missing clipboard", undefined],
  ["missing writeText", {}],
  [
    "rejected writeText",
    {
      async writeText() {
        throw new Error("Permission denied");
      },
    },
  ],
]) {
  test(`clipboard falls back for ${name} and restores focus and selection`, async (t) => {
    const browser = mockBrowser(t, { clipboard });
    const text = "First line\nSecond line: λ";
    assert.equal(await copyTextToClipboard(text), undefined);
    assert.equal(browser.textarea.value, text);
    assert.equal(browser.textarea.readOnly, true);
    assert.equal(browser.textarea.style.position, "fixed");
    assert.equal(browser.textarea.style.opacity, "0");
    assert.equal(browser.calls.filter((call) => call === "copy").length, 1);
    assert.equal(browser.calls.filter((call) => call === "clone").length, 2);
    browser.assertRestored();
  });
}

test("clipboard rejection waits before falling back", async (t) => {
  let rejectWrite;
  const browser = mockBrowser(t, {
    clipboard: {
      writeText: () =>
        new Promise((_, reject) => {
          rejectWrite = reject;
        }),
    },
  });
  const copying = copyTextToClipboard("pending text");
  assert.deepEqual(browser.calls, []);
  rejectWrite(new Error("Blocked"));
  await copying;
  browser.assertRestored();
});

for (const failure of ["false", "throw", "unavailable"]) {
  test(`clipboard rejects when execCommand is ${failure}, with cleanup`, async (t) => {
    const error = new Error("Copy command failed");
    const browser = mockBrowser(t, {
      copy() {
        if (failure === "throw") throw error;
        return false;
      },
    });
    if (failure === "unavailable") delete browser.document.execCommand;
    if (failure === "throw") {
      await assert.rejects(
        copyTextToClipboard("text"),
        (actual) => actual === error,
      );
    } else {
      await assert.rejects(copyTextToClipboard("text"));
    }
    browser.assertRestored();
  });
}

test("clipboard fallback works without a prior selection or focused HTMLElement", async (t) => {
  const browser = mockBrowser(t);
  browser.document.activeElement = null;
  browser.document.getSelection = () => null;
  await copyTextToClipboard("");
  assert.equal(browser.textarea.value, "");
  assert.ok(browser.calls.includes("remove"));
  assert.equal(
    browser.calls.some((call) => Array.isArray(call)),
    false,
  );
});

test("clipboard rejects when neither modern API nor a document is available", async (t) => {
  setGlobal(t, "navigator", undefined);
  setGlobal(t, "document", undefined);
  await assert.rejects(copyTextToClipboard("text"));
});
