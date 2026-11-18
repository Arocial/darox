import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/"))
      return nextResolve(
        new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
        context,
      );
    return nextResolve(specifier, context);
  },
});

const { useBackendStore: backend } = await import(
  "../components/darox-ui/backend-store.ts"
);
const { useAgentTabs: agents, sessionToAgentTab } = await import(
  "../components/darox-ui/agent-store.ts"
);
const {
  focusNotificationSession,
  listenForTurnNotificationClicks,
  notifyTurnCompletion,
} = await import("../lib/turn-notifications.ts");

const manager = {
  id: "source",
  url: "http://source:3145",
  token: "source-key",
};
const otherManager = {
  id: "other",
  url: "http://other:3145",
  token: "other-key",
};
const startedAt = "2026-10-12T03:00:00Z";
const profile = { id: "coder", status: "running", started_at: startedAt };
const target = {
  managerId: manager.id,
  profileId: profile.id,
  startedAt,
  sessionPath: "root/parent/child",
};
const session = (path, children = [], active = false) => ({
  id: path.at(-1),
  path,
  agent_name: path.at(-1),
  active,
  children,
});
const root = session(
  ["root"],
  [session(["root", "parent"], [session(["root", "parent", "child"])])],
  true,
);

const rootUrl = "http://source:3145/api/profiles/coder/proxy/api/sessions/root";

function setup(t, { profiles = [profile], tree = root, getTree } = {}) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { setItem() {} },
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options.method, options.headers.get("Authorization")]);
    if (url === "http://source:3145/api/profiles")
      return Response.json(profiles);
    if (url === rootUrl) return getTree ? getTree() : Response.json(tree);
    throw new Error(`Unexpected request: ${url}`);
  });
  backend.setState({
    managers: [manager, otherManager],
    activeManagerId: otherManager.id,
    activeProfile: profile.id,
    activeBackendId: "other:coder",
    connections: { other: { status: "connected", profiles: [profile] } },
    status: "connected",
    apiBase: "http://other:3145/api/profiles/coder/proxy",
  });
  agents.getState().clearAgents();
  return calls;
}

test("notification switches to its source Manager and selects a full nested session path", async (t) => {
  const calls = setup(t);
  await focusNotificationSession(target);
  assert.equal(backend.getState().activeBackendId, "source:coder");
  assert.equal(agents.getState().activeId, "root");
  assert.deepEqual(agents.getState().notificationSelection, {
    rootId: "root",
    sessionPath: "root/parent/child",
  });
  assert.deepEqual(calls, [
    ["http://source:3145/api/profiles", "GET", "Bearer source-key"],
    [rootUrl, "GET", "Bearer source-key"],
  ]);
  await focusNotificationSession({ ...target, sessionPath: "root" });
  assert.equal(agents.getState().notificationSelection.sessionPath, "root");
  assert.equal(agents.getState().tabs.length, 1);
});

test("stale or unavailable targets do not change profile or start workers", async (t) => {
  for (const [options, expectedRequests] of [
    [{ profiles: [{ ...profile, status: "stopped" }] }, 1],
    [{ profiles: [{ ...profile, started_at: "different execution" }] }, 1],
    [{ tree: { ...root, active: false } }, 2],
    [{ tree: session(["root"], [session(["root", "child"])], true) }, 2],
  ]) {
    await t.test(JSON.stringify(options), async (subtest) => {
      const calls = setup(subtest, options);
      await focusNotificationSession(target);
      assert.equal(backend.getState().activeBackendId, "other:coder");
      assert.equal(agents.getState().notificationSelection, null);
      assert.equal(calls.length, expectedRequests);
      assert.ok(calls.every(([, method]) => method === "GET"));
    });
  }
});

test("renderer subscribes before draining a click queued while it was loading", async (t) => {
  setup(t);
  let listening = false;
  let drainCount = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      darox: {
        onTurnNotificationClick(listener) {
          this.receiveClick = listener;
          listening = true;
          return () => {
            listening = false;
          };
        },
        async takeTurnNotificationTarget() {
          assert.equal(listening, true);
          return ++drainCount === 1 ? target : null;
        },
      },
    },
  });
  t.after(() => {
    delete globalThis.window;
  });
  const stop = listenForTurnNotificationClicks();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    agents.getState().notificationSelection.sessionPath,
    target.sessionPath,
  );
  window.darox.receiveClick();
  assert.equal(drainCount, 2);
  stop();
  assert.equal(listening, false);
});

test("when the native toast is unavailable, a browser notification click focuses the page and locates the session", async (t) => {
  setup(t);
  await focusNotificationSession(target);
  agents.getState().setActiveId("root");
  let nativeInput;
  let toast;
  let focused = false;
  let closed = false;
  class BrowserNotification {
    static permission = "granted";
    constructor(title, options) {
      toast = this;
      assert.equal(title, "Turn completed: child");
      assert.equal(options.body, "Task completed in project");
    }
    close() {
      closed = true;
    }
  }
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: BrowserNotification,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      Notification: BrowserNotification,
      focus: () => {
        focused = true;
      },
      darox: {
        async showTurnNotification(input) {
          nativeInput = input;
          return false;
        },
      },
    },
  });
  t.after(() => {
    delete globalThis.Notification;
    delete globalThis.window;
  });
  await notifyTurnCompletion(
    "child",
    "project",
    target.sessionPath,
    backend.getState().apiBase,
  );
  assert.deepEqual(nativeInput.target, target);
  toast.onclick();
  assert.ok(focused);
  assert.ok(closed);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    agents.getState().notificationSelection.sessionPath,
    target.sessionPath,
  );
});

test("a notification lookup cannot restore a target removed by a newer WebSocket tree", async (t) => {
  let getTree = () => Response.json(root);
  setup(t, { getTree: () => getTree() });
  await focusNotificationSession({ ...target, sessionPath: "root" });
  agents.getState().setActiveId("root");

  const lookup = Promise.withResolvers();
  const requested = Promise.withResolvers();
  getTree = () => {
    requested.resolve();
    return lookup.promise;
  };
  const focus = focusNotificationSession(target);
  await requested.promise;
  const liveTree = sessionToAgentTab({ ...root, children: [] });
  agents.getState().updateAgent(liveTree);
  lookup.resolve(Response.json(root));
  await focus;

  assert.equal(agents.getState().tabs[0], liveTree);
  assert.equal(agents.getState().notificationSelection, null);
});
