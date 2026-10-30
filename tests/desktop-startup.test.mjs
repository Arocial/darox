import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { productionCsp } from "../electron/content-security.ts";
import {
  ensureManager,
  isLocalManager,
  probeManager,
  portInUse,
} from "../electron/local-manager.ts";
import { tokenCache } from "../electron/token-cache.ts";
import { createStaticServer } from "../scripts/serve.mjs";

const temporary = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "darox-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test("CSP allows exact inline script hashes without unsafe script execution", () => {
  const source = "(self.__next_f=self.__next_f||[]).push([0])";
  const csp = productionCsp(
    `<script>${source}</script><script src="/app.js"></script><script>${source}</script>`,
  );
  const hash = createHash("sha256").update(source).digest("base64");
  assert.ok(csp.includes(`'sha256-${hash}'`));
  assert.equal(csp.match(/sha256-/g).length, 1);
  const scripts = csp.match(/script-src ([^;]*)/)[1];
  assert.ok(!scripts.includes("unsafe-inline"));
  assert.ok(!scripts.includes("unsafe-eval"));
  assert.ok(csp.includes("object-src 'none'"));
});

test("Manager tokens are encrypted, URL-bound, replaceable and permission restricted", (t) => {
  const file = path.join(temporary(t), "tokens.json");
  const cache = tokenCache(file);
  const url = "http://127.0.0.1:3145";
  assert.equal(cache.read(url), "");
  cache.write(url, "secret-one");
  assert.ok(!fs.readFileSync(file, "utf8").includes("secret-one"));
  assert.equal(cache.read(url), "secret-one");
  assert.equal(cache.read("http://other:3145"), "");
  cache.write(url, "replacement");
  assert.equal(cache.read(url), "replacement");
  if (process.platform !== "win32")
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  const wrongKey = Buffer.alloc(32, 7);
  const wrongCache = tokenCache(file, wrongKey);
  assert.throws(() => wrongCache.read(url));
});

test("Manager startup reuses occupied ports and never spawns on authentication failure", async () => {
  let launches = 0;
  const options = {
    url: "http://127.0.0.1:3145",
    token: "token",
    occupied: async () => true,
    launch: async () => {
      launches++;
    },
    probe: async () => {},
  };
  assert.equal(await ensureManager(options), "reused");
  await assert.rejects(
    ensureManager({
      ...options,
      probe: async () => {
        throw new Error("authentication failed");
      },
    }),
    /authentication failed/,
  );
  assert.equal(launches, 0);
});

test("Manager startup launches once, waits for readiness and reports timeout/spawn errors", async () => {
  let launches = 0;
  let attempts = 0;
  const options = {
    url: "http://localhost:3145",
    token: "",
    occupied: async () => false,
    launch: async () => {
      launches++;
    },
    probe: async () => {
      if (++attempts < 3) throw new Error("not ready");
    },
    delay: async () => {},
  };
  assert.equal(await ensureManager(options), "started");
  assert.equal(launches, 1);
  assert.equal(attempts, 3);
  await assert.rejects(
    ensureManager({
      ...options,
      timeoutMs: 0,
      probe: async () => {
        throw new Error("not ready");
      },
    }),
    /did not become ready/,
  );
  await assert.rejects(
    ensureManager({
      ...options,
      launch: async () => {
        throw new Error("ENOENT");
      },
    }),
    /ENOENT/,
  );
  await assert.rejects(
    ensureManager({ ...options, url: "https://remote.test" }),
    /local HTTP/,
  );
  assert.equal(isLocalManager("http://127.0.0.1.evil.test"), false);
  assert.equal(isLocalManager("http://127.0.0.1/path"), false);
});

test("static server serves exported routes/assets and rejects traversal, symlinks and writes", async (t) => {
  const root = temporary(t);
  const outside = temporary(t);
  fs.writeFileSync(path.join(root, "index.html"), "<h1>Darox</h1>");
  fs.writeFileSync(path.join(root, "settings.html"), "settings");
  fs.writeFileSync(path.join(root, "app.js"), "console.log('ok')");
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
  fs.symlinkSync(
    path.join(outside, "secret.txt"),
    path.join(root, "secret.txt"),
  );
  const server = await createStaticServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await portInUse(url), true);
  assert.equal(await (await fetch(url)).text(), "<h1>Darox</h1>");
  assert.equal(await (await fetch(`${url}/settings`)).text(), "settings");
  assert.match(
    (await fetch(`${url}/app.js`)).headers.get("content-type"),
    /javascript/,
  );
  assert.equal((await fetch(`${url}/secret.txt`)).status, 403);
  assert.equal((await fetch(`${url}/%2e%2e%2fsecret.txt`)).status, 403);
  assert.equal((await fetch(`${url}/missing`)).status, 404);
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  assert.equal(await (await fetch(url, { method: "HEAD" })).text(), "");
  await assert.rejects(probeManager(url, "token"), /HTTP 404/);
});
