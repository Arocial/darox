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
const { useAgentTabs: agents } = await import(
  "../components/darox-ui/agent-store.ts"
);
const { refreshActiveBackend, monitorManager } = await import(
  "../lib/manager-monitor.ts"
);

const storage = {
  setItem() {},
  getItem() {
    return null;
  },
};
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { hidden: false });
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  configurable: true,
});

const profile = (started_at) => ({
  id: "coder",
  status: "running",
  started_at,
});
const seed = () => {
  agents.setState({
    tabs: [{ id: "old-session" }],
    activeId: "old-session",
    sessions: [{ id: "old-session" }],
    isBusy: { "old-session": { coder: true } },
    completionUnread: { "old-session": { coder: true } },
  });
};

test("restart invalidates old tabs synchronously; unchanged execution preserves them", async () => {
  let started = "first";
  globalThis.fetch = async () => Response.json([profile(started)]);
  await backend.getState().saveManager({
    name: "local",
    url: "http://localhost:3145",
    token: "",
    rememberToken: false,
  });
  seed();
  assert.equal(await refreshActiveBackend(), true);
  assert.equal(agents.getState().activeId, "old-session");
  const revision = backend.getState().connectionRevision;
  started = "second";
  let observed = false;
  const off = backend.subscribe((state) => {
    if (state.connectionRevision !== revision) {
      observed = true;
      assert.deepEqual(agents.getState().tabs, []);
      assert.deepEqual(agents.getState().sessions, []);
      assert.deepEqual(agents.getState().isBusy, {});
      assert.deepEqual(agents.getState().completionUnread, {});
    }
  });
  assert.equal(await refreshActiveBackend(), false);
  off();
  assert.equal(observed, true);
  assert.equal(agents.getState().activeId, null);
});

test("freshness probes coalesce and refuse reconnect after selection changes", async () => {
  let resolve;
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  };
  const first = refreshActiveBackend();
  const second = refreshActiveBackend();
  assert.equal(calls, 1);
  backend.setState({
    connectionRevision: backend.getState().connectionRevision + 1,
  });
  resolve(Response.json([profile("second")]));
  assert.equal(await first, false);
  assert.equal(await second, false);
});

test("page monitor survives Manager outage and recovers even without session tabs", async () => {
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  assert.equal(await refreshActiveBackend(), false);
  assert.equal(backend.getState().status, "disconnected");
  const originalTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const scheduled = new Map();
  let id = 0;
  globalThis.setTimeout = (callback) => {
    scheduled.set(++id, callback);
    return id;
  };
  globalThis.clearTimeout = (timer) => scheduled.delete(timer);
  let stop;
  try {
    stop = monitorManager(backend.getState().activeManagerId);
    globalThis.fetch = async () => Response.json([profile("third")]);
    const [timer, callback] = scheduled.entries().next().value;
    scheduled.delete(timer);
    callback();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(backend.getState().status, "connected");
    assert.deepEqual(agents.getState().tabs, []);
    assert.ok(scheduled.size > 0);
    stop();
    assert.equal(scheduled.size, 0);
  } finally {
    stop?.();
    globalThis.setTimeout = originalTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
