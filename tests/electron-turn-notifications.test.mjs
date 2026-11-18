import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { registerTurnNotifications } from "../electron/turn-notifications.ts";

const target = {
  managerId: "manager-one",
  profileId: "profile-one",
  startedAt: "2026-01-01T00:00:00Z",
  sessionPath: "parent/child/grandchild",
};
const input = { title: "Done", body: "Turn completed", target };

function setup({
  supported = true,
  show = (toast) => toast.emit("show"),
  recreate = false,
} = {}) {
  const handlers = new Map();
  const calls = [];
  const notifications = [];
  const makeWindow = () => ({
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
    webContents: {
      mainFrame: { url: "app://darox/index.html" },
      send: (...args) => calls.push(args),
    },
  });
  let window = makeWindow();
  const originalWindow = window;
  registerTurnNotifications({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    appUrl: "app://darox/index.html",
    getWindow: () => window,
    recreateWindow: recreate
      ? () => {
          calls.push("recreate");
          window = makeWindow();
          // A newly created frame is still loading, so it cannot pull yet.
          window.webContents.mainFrame.url = "about:blank";
          return window;
        }
      : undefined,
    focusApp: () => calls.push("focus-app"),
    isSupported: () => supported,
    createNotification: (text) => {
      const toast = new EventEmitter();
      toast.text = text;
      toast.show = () => show(toast);
      toast.close = () => calls.push("close-toast");
      notifications.push(toast);
      return toast;
    },
  });
  const sender = () => ({
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  });
  return {
    calls,
    notifications,
    originalWindow,
    closeWindow: () => {
      window = null;
    },
    loadWindow: () => {
      window.webContents.mainFrame.url = "app://darox/index.html";
    },
    show: (data = input, event = sender()) =>
      handlers.get("notification:show-turn")(event, data),
    take: (event = sender()) =>
      handlers.get("notification:take-turn-target")(event),
  };
}

test("only the current main renderer's trusted main frame can show or take", async () => {
  const app = setup();
  const sender = app.originalWindow.webContents;
  const untrustedContents = { mainFrame: sender.mainFrame };
  for (const event of [
    { sender: untrustedContents, senderFrame: untrustedContents.mainFrame },
    { sender, senderFrame: { url: sender.mainFrame.url } },
    { sender, senderFrame: null },
  ]) {
    assert.equal(await app.show(input, event), false);
  }
  sender.mainFrame.url = "app://other/index.html";
  assert.equal(await app.show(), false);
  app.loadWindow();
  assert.equal(
    await app.show({ ...input, target: { ...target, startedAt: 1 } }),
    false,
  );
  assert.equal(app.notifications.length, 0);

  assert.equal(await app.show(), true);
  assert.deepEqual(app.notifications[0].text, {
    title: input.title,
    body: input.body,
  });
  app.notifications[0].emit("click");
  assert.equal(app.take({ sender, senderFrame: null }), null);
  assert.deepEqual(app.take(), target);
  assert.equal(app.take(), null);
});

test("click restores, shows and focuses the window before signaling the renderer", async () => {
  const app = setup();
  assert.equal(await app.show(), true);
  const toast = app.notifications[0];
  // Windows can keep a timed-out banner clickable in Action Center.
  toast.emit("close", { reason: "timedOut" });
  toast.emit("click");
  assert.deepEqual(app.calls, [
    "restore",
    "show",
    "focus-app",
    "focus",
    ["notification:turn-click"],
  ]);
  assert.deepEqual(app.take(), target);
});

test("click recreates a closed macOS window and retains the target through renderer startup", async () => {
  const app = setup({ recreate: true });
  assert.equal(await app.show(), true);
  app.closeWindow();
  app.notifications[0].emit("click");
  assert.deepEqual(app.calls, [
    "recreate",
    "restore",
    "show",
    "focus-app",
    "focus",
    ["notification:turn-click"],
  ]);
  const oldSender = app.originalWindow.webContents;
  assert.equal(
    app.take({ sender: oldSender, senderFrame: oldSender.mainFrame }),
    null,
  );
  assert.equal(app.take(), null);
  app.loadWindow();
  assert.deepEqual(app.take(), target);
  assert.equal(app.take(), null);
});

test("latest click wins, and a targetless click still activates the window", async () => {
  const app = setup();
  await app.show();
  await app.show({ ...input, target: { ...target, sessionPath: "latest" } });
  await app.show({ ...input, target: null });
  app.notifications[0].emit("click");
  app.notifications[1].emit("click");
  assert.deepEqual(app.take(), { ...target, sessionPath: "latest" });
  app.notifications[2].emit("click");
  assert.equal(app.take(), null);
  assert.equal(app.calls.filter((call) => call === "focus").length, 3);
});

test("unsupported, failed and thrown native shows permit browser fallback", async () => {
  const unsupported = setup({ supported: false });
  assert.equal(await unsupported.show(), false);
  assert.equal(unsupported.notifications.length, 0);

  const failure = setup({
    show: (toast) => toast.emit("failed", {}, "OS rejected"),
  });
  assert.equal(await failure.show(), false);
  failure.notifications[0].emit("click");
  assert.deepEqual(failure.calls, []);

  const thrown = setup({
    show: () => {
      throw new Error("OS error");
    },
  });
  assert.equal(await thrown.show(), false);
  assert.deepEqual(thrown.calls, ["close-toast"]);
});
