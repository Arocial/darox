import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { setImmediate as nextTurn } from "node:timers/promises";
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

const session = (id, active = true) => ({
  id,
  path: [id],
  agent_name: id,
  workspace: `/work/${id}`,
  created_at: "2026-10-12T03:00:00Z",
  updated_at: "2026-10-12T03:00:00Z",
  metadata: {},
  active,
  task_name: null,
  target: null,
  result: null,
  error: null,
  children: [],
});
const sessionsUrl = (profile = "coder") =>
  `http://manager:3145/api/profiles/${profile}/proxy/api/sessions`;
const tabIds = () => agents.getState().tabs.map(({ id }) => id);

function selectProfile(profile) {
  backend.setState({
    activeManagerId: "manager",
    activeProfile: profile,
    activeBackendId: `manager:${profile}`,
    apiBase: sessionsUrl(profile).slice(0, -"/api/sessions".length),
  });
}

async function setup(t, sessions) {
  backend.setState(backend.getInitialState(), true);
  agents.setState(agents.getInitialState(), true);
  selectProfile("coder");

  const requests = [];
  t.mock.method(globalThis, "fetch", (url, options) => {
    const { promise, resolve, reject } = Promise.withResolvers();
    requests.push({ method: options.method ?? "GET", url, resolve, reject });
    return promise;
  });
  function takeRequest(method, url) {
    const request = requests.shift();
    assert.deepEqual([request?.method, request?.url], [method, url]);
    return request;
  }
  const initialLoad = agents.getState().loadAgents();
  takeRequest("GET", sessionsUrl()).resolve(Response.json(sessions));
  await initialLoad;
  return { requests, takeRequest };
}

// Fail promptly if a close accidentally waits for an unresolved mocked GET.
async function assertCloseResult(close, expected) {
  const pending = Symbol("close still pending");
  assert.equal(await Promise.race([close, nextTurn(pending)]), expected);
}

test("closing a tab immediately selects another and waits only for the deduped stop", async (t) => {
  const first = session("first");
  const second = session("second");
  const { requests, takeRequest } = await setup(t, [first, second]);
  const mountedTab = agents.getState().tabs[0];

  const close = agents.getState().deleteAgent(first.id);
  assert.equal(agents.getState().activeId, second.id);
  const marker = agents.getState().closingSessionIds.get(first.id);
  assert.equal(typeof marker, "symbol");
  assert.equal(agents.getState().tabs[0], mountedTab);
  assert.deepEqual(agents.getState().sessions, [first, second]);

  const duplicate = agents.getState().deleteAgent(first.id);
  assert.equal(agents.getState().closingSessionIds.get(first.id), marker);
  await nextTurn();
  const stop = takeRequest("POST", `${sessionsUrl()}/${first.id}/stop`);
  assert.equal(requests.length, 0);

  stop.resolve(new Response(null, { status: 204 }));
  await assertCloseResult(close, true);
  await assertCloseResult(duplicate, true);
  assert.equal(agents.getState().closingSessionIds.has(first.id), false);
  assert.equal(agents.getState().activeId, second.id);
  assert.deepEqual(tabIds(), [second.id]);
  const stopped = { ...first, active: false };
  assert.deepEqual(agents.getState().sessions, [stopped, second]);

  takeRequest("GET", sessionsUrl()).resolve(Response.json([stopped, second]));
  await nextTurn();
  assert.equal(requests.length, 0);
});

test("a rejected stop restores the only tab and allows retry", async (t) => {
  const root = session("root");
  const { requests, takeRequest } = await setup(t, [root]);
  t.mock.method(console, "error", () => {});

  const close = agents.getState().deleteAgent(root.id);
  assert.equal(agents.getState().activeId, null);
  assert.equal(agents.getState().closingSessionIds.has(root.id), true);
  takeRequest("POST", `${sessionsUrl()}/${root.id}/stop`).reject(
    new Error("Connection lost"),
  );
  await assertCloseResult(close, false);
  assert.equal(agents.getState().closingSessionIds.has(root.id), false);
  assert.equal(agents.getState().activeId, root.id);
  assert.deepEqual(tabIds(), [root.id]);
  assert.deepEqual(agents.getState().sessions, [root]);
  assert.equal(requests.length, 0);

  const retry = agents.getState().deleteAgent(root.id);
  takeRequest("POST", `${sessionsUrl()}/${root.id}/stop`).resolve(
    new Response(null, { status: 204 }),
  );
  await assertCloseResult(retry, true);
  assert.equal(agents.getState().activeId, null);
  assert.deepEqual(tabIds(), []);
  takeRequest("GET", sessionsUrl()).resolve(
    Response.json([session(root.id, false)]),
  );
  await nextTurn();
});

test("an unsuccessful HTTP stop does not take back selection from another tab", async (t) => {
  const first = session("first");
  const second = session("second");
  const third = session("third");
  const { requests, takeRequest } = await setup(t, [first, second, third]);
  t.mock.method(console, "error", () => {});

  const close = agents.getState().deleteAgent(first.id);
  assert.equal(agents.getState().activeId, second.id);
  agents.getState().setActiveId(third.id);
  takeRequest("POST", `${sessionsUrl()}/${first.id}/stop`).resolve(
    new Response(null, { status: 500 }),
  );

  await assertCloseResult(close, false);
  assert.equal(agents.getState().activeId, third.id);
  assert.equal(agents.getState().closingSessionIds.has(first.id), false);
  assert.deepEqual(tabIds(), [first.id, second.id, third.id]);
  assert.deepEqual(agents.getState().sessions, [first, second, third]);
  assert.equal(requests.length, 0);
});

for (const load of ["loadAgents", "loadSessions"]) {
  test(`a stale ${load} response cannot bring back a stopped session`, async (t) => {
    const root = session("root");
    const { takeRequest } = await setup(t, [root]);

    const oldLoad = agents.getState()[load]();
    const oldList = takeRequest("GET", sessionsUrl());
    const close = agents.getState().deleteAgent(root.id);
    takeRequest("POST", `${sessionsUrl()}/${root.id}/stop`).resolve(
      new Response(null, { status: 204 }),
    );
    await assertCloseResult(close, true);
    const refresh = takeRequest("GET", sessionsUrl());

    oldList.resolve(Response.json([root]));
    await oldLoad;
    assert.deepEqual(tabIds(), []);
    assert.equal(agents.getState().activeId, null);
    assert.deepEqual(agents.getState().sessions, [session(root.id, false)]);

    refresh.resolve(Response.json([session(root.id, false)]));
    await nextTurn();
  });
}

test("a stop completing after a profile switch updates only its source workspace", async (t) => {
  const root = session("root");
  const fallback = session("fallback");
  const otherRoot = { ...root, workspace: "/other/root" };
  const { requests, takeRequest } = await setup(t, [root, fallback]);

  const close = agents.getState().deleteAgent(root.id);
  const stop = takeRequest("POST", `${sessionsUrl()}/${root.id}/stop`);
  assert.equal(agents.getState().closingSessionIds.has(root.id), true);

  selectProfile("other");
  const load = agents.getState().loadAgents();
  takeRequest("GET", sessionsUrl("other")).resolve(Response.json([otherRoot]));
  await load;
  assert.equal(agents.getState().closingSessionIds.has(root.id), false);
  assert.equal(agents.getState().activeId, root.id);

  stop.resolve(new Response(null, { status: 204 }));
  await assertCloseResult(close, true);
  assert.equal(requests.length, 0);
  assert.deepEqual(tabIds(), [root.id]);
  assert.equal(agents.getState().activeId, root.id);
  assert.deepEqual(agents.getState().sessions, [otherRoot]);

  selectProfile("coder");
  assert.equal(agents.getState().closingSessionIds.has(root.id), false);
  assert.equal(agents.getState().activeId, fallback.id);
  assert.deepEqual(tabIds(), [fallback.id]);
  assert.deepEqual(agents.getState().sessions, [
    session(root.id, false),
    fallback,
  ]);
});
