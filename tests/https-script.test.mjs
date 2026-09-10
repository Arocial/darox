import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "darox-https-test-"));
const binaryDirectory = join(temporaryDirectory, "bin");
const fakeCaddy = join(binaryDirectory, "caddy");
mkdirSync(binaryDirectory);
writeFileSync(
  fakeCaddy,
  `#!/usr/bin/env bash
printf 'addresses=%s\nmanager=%s\nweb=%s\nargs=%s\n' \
  "$DAROX_HTTPS_ADDRESSES" "$DAROX_MANAGER_UPSTREAM" "$DAROX_WEB_UPSTREAM" "$*"
`,
);
chmodSync(fakeCaddy, 0o755);

after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

const run = (arguments_, environment = {}) =>
  spawnSync("bash", ["scripts/https.sh", ...arguments_], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      ...environment,
      PATH: `${binaryDirectory}:${process.env.PATH}`,
    },
  });

test("HTTPS script configures certificates for multiple addresses and both upstreams", () => {
  const result = run([
    "darox.example",
    "192.168.1.20:8443",
    "--manager",
    "http://manager.lan:3145",
    "--web=web.lan:3140",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /addresses=darox\.example:3143, 192\.168\.1\.20:8443/,
  );
  assert.match(result.stdout, /manager=http:\/\/manager\.lan:3145/);
  assert.match(result.stdout, /web=web\.lan:3140/);
  assert.match(
    result.stdout,
    /args=run --config .*\/scripts\/Caddyfile --adapter caddyfile/,
  );
});

test("HTTPS script keeps environment upstreams as option defaults", () => {
  const result = run(["darox.example"], {
    DAROX_MANAGER_UPSTREAM: "manager.env:4145",
    DAROX_WEB_UPSTREAM: "web.env:4140",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manager=manager\.env:4145/);
  assert.match(result.stdout, /web=web\.env:4140/);
});

test("HTTPS script rejects missing addresses and invalid ports", () => {
  const missing = run(["--manager", "manager.lan:3145"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /At least one host or IP address is required/);

  const invalidPort = run(["darox.example:70000"]);
  assert.equal(invalidPort.status, 1);
  assert.match(invalidPort.stderr, /expected a value from 1 to 65535/);
});
