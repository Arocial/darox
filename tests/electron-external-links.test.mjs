import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { configureExternalLinks } from "../electron/external-links.ts";

function setup(appUrl = "app://darox/index.html", openExternal) {
  const contents = new EventEmitter();
  let windowOpenHandler;
  contents.setWindowOpenHandler = (handler) => {
    windowOpenHandler = handler;
  };
  const opened = [];
  configureExternalLinks(
    contents,
    appUrl,
    openExternal ??
      (async (url) => {
        opened.push(url);
      }),
  );
  return {
    opened,
    openWindow: (url) => windowOpenHandler({ url }),
    navigate: (url, eventName = "will-navigate") => {
      let prevented = false;
      contents.emit(
        eventName,
        {
          preventDefault() {
            prevented = true;
          },
        },
        url,
      );
      return prevented;
    },
  };
}

test("external navigation and redirects open in the system browser", () => {
  for (const eventName of ["will-navigate", "will-redirect"]) {
    const app = setup();
    assert.equal(app.navigate("https://example.com/docs", eventName), true);
    assert.deepEqual(app.opened, ["https://example.com/docs"]);
  }
});

test("new-window links open externally without creating Electron windows", () => {
  const app = setup();
  assert.deepEqual(app.openWindow("https://example.com"), { action: "deny" });
  assert.deepEqual(app.opened, ["https://example.com"]);
});

test("internal navigation remains in the development and packaged apps", () => {
  for (const [appUrl, internalUrl] of [
    ["app://darox/index.html", "app://darox/settings.html#section"],
    ["http://localhost:3140", "http://localhost:3140/settings#section"],
  ]) {
    const app = setup(appUrl);
    assert.equal(app.navigate(internalUrl), false);
    assert.deepEqual(app.openWindow(internalUrl), { action: "deny" });
    assert.deepEqual(app.opened, []);
  }
});

test("other hosts, ports and protocols are not treated as internal", () => {
  const app = setup("http://localhost:3140");
  for (const url of [
    "http://localhost.example.com:3140",
    "http://localhost:3145",
    "https://localhost:3140",
    "http://user@localhost:3140",
  ]) {
    assert.equal(app.navigate(url), true);
    assert.equal(app.opened.at(-1), url);
  }
});

test("unsafe protocols and malformed URLs are blocked without opening them", () => {
  const app = setup();
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hello",
    "custom-app://run",
    "app://other/index.html",
    "not a URL",
  ]) {
    assert.equal(app.navigate(url), true);
    assert.deepEqual(app.openWindow(url), { action: "deny" });
  }
  assert.deepEqual(app.opened, []);
});

test("HTTP and mail links are handled by the system", () => {
  const app = setup();
  for (const url of ["http://example.com", "mailto:hello@example.com"]) {
    assert.equal(app.navigate(url), true);
  }
  assert.deepEqual(app.opened, [
    "http://example.com",
    "mailto:hello@example.com",
  ]);
});

test("opening failures are reported without an unhandled rejection", async (t) => {
  const error = new Error("No browser available");
  const log = t.mock.method(console, "error", () => {});
  const app = setup(undefined, async () => {
    throw error;
  });
  assert.equal(app.navigate("https://example.com"), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(log.mock.callCount(), 1);
  assert.deepEqual(log.mock.calls[0].arguments, [
    "Failed to open external link:",
    error,
  ]);
});
