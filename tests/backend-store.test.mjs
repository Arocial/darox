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

const { useBackendStore: store, profileKey } = await import(
  "../components/darox-ui/backend-store.ts"
);
const { getBackendAuthToken } = await import("../lib/backend-auth.ts");
const { createUuid } = await import("../lib/id.ts");
const { normalizeManagerUrl } = await import("../lib/manager-client.ts");
const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};
Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage(),
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: memoryStorage(),
  configurable: true,
});
const profile = (status = "running", started_at = "2026-09-10T12:00:00Z") => ({
  id: "coder",
  autostart: false,
  port: status === "stopped" ? null : 3142,
  status,
  started_at,
  exit_code: null,
  last_error: null,
});
const response = (body, status = 200) => Response.json(body, { status });
const config = (name, token = name) => ({
  name,
  url: `http://${name}:3145`,
  token,
  rememberToken: false,
});
const reset = () => {
  for (const manager of store.getState().managers)
    store.getState().deleteManager(manager.id);
};

// Run sequentially: the UI store and browser storage are intentionally shared singletons.
test("multiple Managers isolate profiles, credentials and selection; removing connections never stops workers", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response([profile()]);
  };
  await store.getState().saveManager(config("one"));
  const one = store.getState().managers[0];
  await store.getState().saveManager(config("two"));
  const two = store.getState().managers[1];
  assert.equal(store.getState().activeBackendId, profileKey(two.id, "coder"));
  assert.equal(getBackendAuthToken(), "two");
  await store.getState().selectProfile(one.id, "coder");
  assert.equal(
    store.getState().apiBase,
    "http://one:3145/api/profiles/coder/proxy",
  );
  assert.equal(getBackendAuthToken(), "one");
  await store.getState().refreshManager(two.id);
  assert.equal(getBackendAuthToken(), "one");
  assert.equal(calls.at(-1).options.headers.get("Authorization"), "Bearer two");
  const count = calls.length;
  store.getState().deleteManager(one.id);
  assert.equal(calls.length, count);
  assert.equal(store.getState().activeBackendId, profileKey(two.id, "coder"));
  assert.equal(getBackendAuthToken(), "two");
  reset();
});

test("saving a stopped or empty Manager does not start a worker; selecting a stopped profile waits past 202", async () => {
  let current = profile("stopped", null);
  let posts = 0;
  let polls = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method === "POST") {
      posts++;
      current = profile("starting", null);
      return response(current, 202);
    }
    if (posts && ++polls === 2) current = profile();
    return response([current]);
  };
  await store.getState().saveManager(config("one"));
  const manager = store.getState().managers[0];
  assert.equal(posts, 0);
  assert.equal(store.getState().status, "disconnected");
  await store.getState().selectProfile(manager.id, "coder");
  assert.equal(posts, 1);
  assert.equal(store.getState().status, "connected");
  assert.deepEqual(store.getState().pending, {});
  reset();
  globalThis.fetch = async () => response([]);
  await store.getState().saveManager(config("empty"));
  assert.equal(store.getState().activeBackendId, null);
  assert.equal(store.getState().managers.length, 1);
  reset();
});

test("unchanged polling preserves connection revision; restart at the same URL changes it", async () => {
  let current = profile();
  globalThis.fetch = async () => response([current]);
  await store.getState().saveManager(config("one"));
  const manager = store.getState().managers[0];
  const revision = store.getState().connectionRevision;
  const url = store.getState().apiBase;
  await store.getState().refreshManager(manager.id);
  assert.equal(store.getState().connectionRevision, revision);
  current = profile("running", "2026-09-10T12:01:00Z");
  await store.getState().refreshManager(manager.id);
  assert.equal(store.getState().connectionRevision, revision + 1);
  assert.equal(store.getState().apiBase, url);
  reset();
});

test("late requests cannot restore deleted or edited Manager connections", async () => {
  globalThis.fetch = async () => response([profile()]);
  await store.getState().saveManager(config("one"));
  const manager = store.getState().managers[0];
  let finish;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const refresh = store.getState().refreshManager(manager.id);
  store.getState().deleteManager(manager.id);
  finish(response([profile()]));
  await refresh;
  assert.deepEqual(store.getState().connections, {});
  assert.equal(store.getState().activeBackendId, null);
});

test("authentication and lifecycle conflicts are visible; Manager recovery retains the selected profile", async () => {
  globalThis.fetch = async () => response([profile()]);
  await store.getState().saveManager(config("one"));
  const manager = store.getState().managers[0];
  globalThis.fetch = async () => response({}, 401);
  await store.getState().refreshManager(manager.id);
  assert.equal(store.getState().status, "disconnected");
  assert.match(
    store.getState().connections[manager.id].error,
    /authentication/,
  );
  assert.equal(store.getState().activeProfile, "coder");
  globalThis.fetch = async (_url, options) =>
    options.method === "POST" ? response({}, 409) : response([profile()]);
  await assert.rejects(
    store.getState().profileAction(manager.id, "coder", "restart"),
    /operation is in progress/,
  );
  assert.deepEqual(store.getState().pending, {});
  assert.equal(store.getState().status, "connected");
  reset();
});

test("tokens obey remember settings and disappear on deletion; Manager URLs reject embedded credentials", async () => {
  globalThis.fetch = async () => response([profile()]);
  await store
    .getState()
    .saveManager({ ...config("one", "session-secret"), rememberToken: false });
  const manager = store.getState().managers[0];
  assert.ok(
    !localStorage.getItem("darox_managers_v1").includes("session-secret"),
  );
  assert.ok(
    !localStorage.getItem("darox_manager_tokens_v1").includes("session-secret"),
  );
  assert.equal(
    JSON.parse(sessionStorage.getItem("darox_manager_session_tokens_v1"))[
      manager.id
    ],
    "session-secret",
  );
  await store.getState().saveManager({
    ...manager,
    token: "persistent-secret",
    rememberToken: true,
  });
  assert.equal(
    JSON.parse(localStorage.getItem("darox_manager_tokens_v1"))[manager.id],
    "persistent-secret",
  );
  assert.equal(
    JSON.parse(sessionStorage.getItem("darox_manager_session_tokens_v1"))[
      manager.id
    ],
    undefined,
  );
  reset();
  assert.equal(localStorage.getItem("darox_manager_tokens_v1"), "{}");
  assert.equal(normalizeManagerUrl("localhost:3145/"), "http://localhost:3145");
  assert.throws(() => normalizeManagerUrl("https://user:secret@example.com"));
});

test("UUID generation works when crypto.randomUUID is unavailable", () => {
  const uuid = createUuid({
    getRandomValues: (bytes) => bytes.fill(0),
  });
  assert.equal(uuid, "00000000-0000-4000-8000-000000000000");
});

test("Electron bootstrap Manager connects without persisting its token", async () => {
  Object.defineProperty(globalThis, "window", {
    value: {
      darox: {
        getBootstrapManager: async () => ({
          name: "Default",
          url: "http://127.0.0.1:3145",
          token: "electron-secret",
        }),
      },
    },
    configurable: true,
  });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response([profile()]);
  };

  const dispose = store.getState().initialize();
  while (!store.getState().hydrated || store.getState().status !== "connected")
    await new Promise((resolve) => setImmediate(resolve));
  dispose();

  const manager = store.getState().managers[0];
  assert.equal(manager.id, "electron-default");
  assert.equal(manager.electronManaged, true);
  assert.equal(
    store.getState().activeBackendId,
    profileKey(manager.id, "coder"),
  );
  assert.equal(
    calls[0].options.headers.get("Authorization"),
    "Bearer electron-secret",
  );
  await store.getState().saveManager(config("remote"));
  assert.ok(
    !(localStorage.getItem("darox_managers_v1") || "").includes(
      "electron-default",
    ),
  );
  assert.ok(
    !(localStorage.getItem("darox_manager_tokens_v1") || "").includes(
      "electron-secret",
    ),
  );
  assert.ok(
    !(sessionStorage.getItem("darox_manager_session_tokens_v1") || "").includes(
      "electron-secret",
    ),
  );
});
