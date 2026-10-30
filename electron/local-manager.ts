import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";

export function isLocalManager(value: string): boolean {
  const url = new URL(value);
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash
  );
}

export function portInUse(url: string): Promise<boolean> {
  const endpoint = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: endpoint.hostname.replace(/^\[|\]$/g, ""),
      port: Number(endpoint.port || 80),
    });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Timed out checking the local Manager port."));
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve(false);
      else reject(error);
    });
  });
}

export async function probeManager(url: string, token: string): Promise<void> {
  const response = await fetch(`${url}/api/profiles`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(1500),
    redirect: "error",
  });
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "Local Manager authentication failed. Edit its connection and save the correct API token.",
    );
  if (!response.ok)
    throw new Error(`Local Manager returned HTTP ${response.status}.`);
  const profiles = await response.json();
  if (
    !Array.isArray(profiles) ||
    !profiles.every(
      (p: { id?: unknown; status?: unknown }) =>
        p && typeof p.id === "string" && typeof p.status === "string",
    )
  )
    throw new Error(
      "The local port is occupied by a service that is not an Arox Manager.",
    );
}

export function launchManager(
  home: string,
  logFile: string,
  token: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.openSync(logFile, "a", 0o600);
  const searchPath = [
    ...new Set([
      ...(process.env.PATH || "").split(path.delimiter),
      path.join(home, ".local", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/usr/bin",
      "/bin",
    ]),
  ]
    .filter(Boolean)
    .join(path.delimiter);
  return new Promise((resolve, reject) => {
    try {
      const child = spawn("arox-manager", [], {
        cwd: home,
        env: { ...process.env, PATH: searchPath, AROX_API_TOKEN: token },
        detached: true,
        stdio: ["ignore", log, log],
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    } catch (error) {
      reject(error);
    } finally {
      fs.closeSync(log);
    }
  });
}

export async function ensureManager(options: {
  url: string;
  token: string;
  occupied: () => Promise<boolean>;
  launch: () => Promise<void>;
  probe: () => Promise<void>;
  timeoutMs?: number;
  delay?: () => Promise<void>;
}): Promise<"reused" | "started"> {
  if (!isLocalManager(options.url))
    throw new Error("Automatic startup requires a local HTTP Manager URL.");
  if (await options.occupied()) {
    await options.probe();
    return "reused";
  }
  await options.launch();
  const deadline = Date.now() + (options.timeoutMs ?? 15000);
  let lastError: unknown;
  do {
    try {
      await options.probe();
      return "started";
    } catch (error) {
      lastError = error;
    }
    await (options.delay?.() ??
      new Promise((resolve) => setTimeout(resolve, 250)));
  } while (Date.now() < deadline);
  throw new Error(
    `Local Manager did not become ready: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
  );
}
