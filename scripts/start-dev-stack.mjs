import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import backendConfig from "../electron/backend-config.cjs";

const { parseBackendConfig } = backendConfig;
const root = fileURLToPath(new URL("../", import.meta.url));
const defaultConfigPath = path.join(
  os.homedir(),
  ".config/arox/profiles/chat/darox.json",
);
const frontendHost = "127.0.0.1";
const frontendPort = 3140;

export async function main() {
  const config = await loadConfiguration(defaultConfigPath);
  const token = await ensureApiToken(config.rawConfig, defaultConfigPath);
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "darox-dev-stack-"),
  );
  const caddyfile = path.join(runtimeDirectory, "Caddyfile");

  try {
    await writeFile(
      caddyfile,
      renderCaddyfile({
        ...config.caddy,
        frontendUpstream: `${frontendHost}:${frontendPort}`,
        routes: config.launches.map((launch) => ({
          profile: launch.profile,
          upstream: `${formatHost(wildcardToLoopback(launch.host))}:${launch.port}`,
        })),
      }),
    );
    await runStack({ caddyfile, config, token });
  } finally {
    await rm(runtimeDirectory, { recursive: true, force: true });
  }
}

export async function loadConfiguration(file) {
  let rawConfig;
  try {
    rawConfig = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new Error(`Backend configuration not found: ${file}`);
    throw new Error(`Unable to read ${file}: ${error.message}`);
  }

  const config = parseBackendConfig(
    rawConfig,
    (message) => new Error(`${file}: ${message}`),
  );
  const launches = Object.entries(config.profiles)
    .filter(([, profile]) => profile.autostart === true)
    .map(([profile, override]) => {
      if (!/^[a-z\d](?:[a-z\d._-]*[a-z\d])?$/i.test(profile))
        throw new Error(`${file}: profiles.${profile} is not URL-safe`);
      const port = override.port ?? config.backend.port;
      if (port === "auto")
        throw new Error(`${file}: profiles.${profile} needs a fixed port`);
      return {
        command: override.command ?? config.backend.command,
        commonArgs: config.backend.args,
        host: singleLine(
          override.host ?? config.backend.host,
          `profiles.${profile}.host`,
          file,
        ),
        port,
        profile,
        profileArgs: override.args ?? [],
      };
    })
    .sort((left, right) => left.profile.localeCompare(right.profile));

  if (launches.length === 0)
    throw new Error(`${file}: at least one profile must set autostart to true`);

  const caddy = objectValue(rawConfig.caddy, "caddy", file);
  return {
    rawConfig,
    launches,
    caddy: {
      bind: singleLine(caddy.bind, "caddy.bind", file),
      domain: hostname(caddy.domain, "caddy.domain", file),
      port: portNumber(caddy.port ?? 3145, "caddy.port", file),
    },
  };
}

export function renderCaddyfile({
  bind,
  domain,
  frontendUpstream,
  port,
  routes,
}) {
  const proxies = routes
    .map(
      ({ profile, upstream }) => `  handle /${profile}/* {
    uri strip_prefix /${profile}
    reverse_proxy ${upstream}
  }`,
    )
    .join("\n\n");

  return `{
  admin off
}

https://${domain}:${port} {
  bind ${bind}
  tls internal
  encode zstd gzip

${proxies}

  handle {
    reverse_proxy ${frontendUpstream}
  }
}
`;
}

async function ensureApiToken(config, file) {
  if (typeof config.apiToken === "string" && config.apiToken.length >= 32) {
    await chmod(file, 0o600);
    return config.apiToken;
  }
  if (config.apiToken !== undefined)
    throw new Error(`${file}: apiToken must contain at least 32 characters`);

  config.apiToken = randomBytes(32).toString("hex");
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
  await chmod(file, 0o600);
  console.log(`Generated apiToken in ${file}.`);
  return config.apiToken;
}

async function runStack({ caddyfile, config, token }) {
  const origin = httpsOrigin(config.caddy.domain, config.caddy.port);
  const processes = [
    startFrontend(config.caddy.domain),
    ...config.launches.map((launch) => startBackend(launch, token)),
    startProcess("Caddy", "caddy", [
      "run",
      "--config",
      caddyfile,
      "--adapter",
      "caddyfile",
    ]),
  ];
  console.log(`Caddy URL: ${origin}`);
  for (const { profile } of config.launches)
    console.log(`Backend URL (${profile}): ${origin}/${profile}`);

  let failure;
  let stopping = false;
  await new Promise((resolve) => {
    const stop = (error) => {
      if (stopping) return;
      stopping = true;
      failure = error;
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      for (const { child } of processes) stopChild(child);
      Promise.all(processes.map(({ done }) => done)).then(resolve);
    };
    const onSignal = () => stop();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    for (const item of processes) {
      item.child.once("error", (error) =>
        stop(new Error(`Unable to start ${item.name}: ${error.message}`)),
      );
      item.child.once("exit", (code, signal) => {
        if (!stopping)
          stop(
            signal === "SIGINT" || signal === "SIGTERM"
              ? undefined
              : new Error(
                  `${item.name} stopped (${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`})`,
                ),
          );
      });
    }
  });
  if (failure) throw failure;
}

function startFrontend(domain) {
  return startProcess(
    "Frontend",
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "dev",
      "--port",
      String(frontendPort),
      "--hostname",
      frontendHost,
    ],
    { cwd: root, env: { ...process.env, DAROX_DEV_HOST: domain } },
  );
}

function startBackend(launch, token) {
  return startProcess(
    `Backend ${launch.profile}`,
    launch.command,
    [
      ...launch.commonArgs,
      "--profile",
      launch.profile,
      ...launch.profileArgs,
      "--ui",
      "vercel_ai",
      "--host",
      launch.host,
      "--port",
      String(launch.port),
    ],
    { env: { ...process.env, AROX_API_TOKEN: token } },
  );
}

function startProcess(name, command, args, options = {}) {
  console.log(`Starting ${name}...`);
  const child = spawn(command, args, { ...options, stdio: "inherit" });
  const done = new Promise((resolve) => {
    child.once("error", resolve);
    child.once("close", resolve);
  });
  return { child, done, name };
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  timer.unref();
  child.once("close", () => clearTimeout(timer));
}

function objectValue(value, name, file) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${file}: ${name} must be an object`);
  return value;
}

function singleLine(value, name, file) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value))
    throw new Error(`${file}: ${name} must be a non-empty single-line string`);
  return value;
}

function hostname(value, name, file) {
  const result = singleLine(value, name, file);
  if (!/^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(result))
    throw new Error(`${file}: ${name} is not a valid hostname`);
  return result;
}

function portNumber(value, name, file) {
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw new Error(`${file}: ${name} must be an integer from 1 to 65535`);
  return value;
}

function wildcardToLoopback(host) {
  if (host === "0.0.0.0") return "127.0.0.1";
  if (host === "::") return "::1";
  return host;
}

function formatHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

function httpsOrigin(domain, port) {
  return port === 443 ? `https://${domain}` : `https://${domain}:${port}`;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
