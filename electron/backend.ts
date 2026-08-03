import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createServer, createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";

export type BackendErrorKind =
  | "invalid_config"
  | "command_not_found"
  | "spawn_error"
  | "startup_timeout"
  | "process_exit";

export interface BackendError {
  kind: BackendErrorKind;
  message: string;
  exitCode?: number | null;
  stderr?: string;
  occurredAt: string;
}

export type ProcessStatus =
  | { status: "Stopped" }
  | { status: "Starting" }
  | { status: "Running" }
  | { status: "StartFailed"; error: BackendError }
  | { status: "Crashed"; error: BackendError };

type PortConfig = number | "auto";

interface BackendDefaults {
  command: string;
  args: string[];
  host: string;
  port: PortConfig;
  startupTimeoutMs: number;
}

interface ProfileConfig {
  command?: string;
  args?: string[];
  host?: string;
  port?: PortConfig;
  startupTimeoutMs?: number;
}

interface DaroxBackendConfig {
  defaultProfile?: string;
  backend: BackendDefaults;
  profiles: Record<string, ProfileConfig>;
}

interface ProfileLaunchSettings {
  command: string;
  commonArgs: string[];
  extraArgs: string[];
  host: string;
  port: PortConfig;
  startupTimeoutMs: number;
}

interface InstanceData {
  child: ChildProcess | null;
  status: ProcessStatus;
  port: number;
  host: string;
  shutdown: boolean;
  command: string[];
}

const CONFIG_DIR = path.join(os.homedir(), ".config/arox/profiles/chat");
const CONFIG_PATH = path.join(CONFIG_DIR, "darox.json");
const DEFAULT_CONFIG: DaroxBackendConfig = {
  backend: {
    command: "arox",
    args: [],
    host: "127.0.0.1",
    port: "auto",
    startupTimeoutMs: 30_000,
  },
  profiles: {},
};
const MANAGED_ARGS = new Set(["--profile", "--ui", "--host", "--port"]);
const STDERR_LIMIT = 16 * 1024;

function configError(message: string): Error {
  return new Error(`Invalid ${CONFIG_PATH}: ${message}`);
}

function validateArgs(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((arg) => typeof arg === "string")) {
    throw configError(`${field} must be an array of strings`);
  }
  for (const arg of value) {
    const name = arg.split("=", 1)[0];
    if (MANAGED_ARGS.has(name)) {
      throw configError(`${field} cannot override managed argument ${name}`);
    }
  }
  return value;
}

function validatePort(value: unknown, field: string): PortConfig {
  if (value === "auto") return value;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65535
  ) {
    throw configError(`${field} must be "auto" or an integer from 1 to 65535`);
  }
  return value;
}

function validateConfig(value: unknown): DaroxBackendConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw configError("root must be an object");
  }
  const raw = value as Record<string, unknown>;
  const backendRaw = (raw.backend ?? {}) as Record<string, unknown>;
  const profilesRaw = (raw.profiles ?? {}) as Record<string, unknown>;
  const backend: BackendDefaults = {
    command:
      backendRaw.command === undefined ? "arox" : String(backendRaw.command),
    args: validateArgs(backendRaw.args ?? [], "backend.args"),
    host: backendRaw.host === undefined ? "127.0.0.1" : String(backendRaw.host),
    port: validatePort(backendRaw.port ?? "auto", "backend.port"),
    startupTimeoutMs:
      backendRaw.startupTimeoutMs === undefined
        ? 30_000
        : Number(backendRaw.startupTimeoutMs),
  };
  if (!backend.command.trim())
    throw configError("backend.command cannot be empty");
  if (!backend.host.trim()) throw configError("backend.host cannot be empty");
  if (
    !Number.isFinite(backend.startupTimeoutMs) ||
    backend.startupTimeoutMs < 1
  ) {
    throw configError("backend.startupTimeoutMs must be a positive number");
  }
  if (
    !profilesRaw ||
    typeof profilesRaw !== "object" ||
    Array.isArray(profilesRaw)
  ) {
    throw configError("profiles must be an object");
  }
  const profiles: Record<string, ProfileConfig> = {};
  for (const [name, entry] of Object.entries(profilesRaw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw configError(`profiles.${name} must be an object`);
    }
    const item = entry as Record<string, unknown>;
    const profile: ProfileConfig = {};
    if (item.command !== undefined) {
      profile.command = String(item.command);
      if (!profile.command.trim())
        throw configError(`profiles.${name}.command cannot be empty`);
    }
    if (item.args !== undefined)
      profile.args = validateArgs(item.args, `profiles.${name}.args`);
    if (item.host !== undefined) {
      profile.host = String(item.host);
      if (!profile.host.trim())
        throw configError(`profiles.${name}.host cannot be empty`);
    }
    if (item.port !== undefined)
      profile.port = validatePort(item.port, `profiles.${name}.port`);
    if (item.startupTimeoutMs !== undefined) {
      profile.startupTimeoutMs = Number(item.startupTimeoutMs);
      if (
        !Number.isFinite(profile.startupTimeoutMs) ||
        profile.startupTimeoutMs < 1
      ) {
        throw configError(
          `profiles.${name}.startupTimeoutMs must be a positive number`,
        );
      }
    }
    profiles[name] = profile;
  }
  const defaultProfile =
    raw.defaultProfile === undefined ? undefined : String(raw.defaultProfile);
  return { defaultProfile, backend, profiles };
}

function readConfig(): DaroxBackendConfig {
  try {
    return validateConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return structuredClone(DEFAULT_CONFIG);
  }
}

function findPort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        srv.close(() => resolve(addr.port));
      } else {
        srv.close();
        reject(new Error("Failed to allocate a backend port"));
      }
    });
  });
}

function checkHealth(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

function makeError(
  kind: BackendErrorKind,
  message: string,
  exitCode?: number | null,
  stderr?: string,
): BackendError {
  return {
    kind,
    message,
    exitCode,
    stderr: stderr?.trim() || undefined,
    occurredAt: new Date().toISOString(),
  };
}

export class BackendManager {
  private instances = new Map<string, InstanceData>();
  private activeProfile: string | null = null;
  private win: BrowserWindow | null = null;
  private apiToken =
    process.env.AROX_API_TOKEN || randomBytes(32).toString("hex");
  private externalBackend?: { url: string; apikey?: string };

  constructor() {
    const ext = process.env.DAROX_EXTERNAL_BACKEND;
    if (ext) {
      try {
        const u = new URL(ext);
        const apikey =
          u.searchParams.get("apikey") || process.env.AROX_API_TOKEN;
        u.searchParams.delete("apikey");
        this.externalBackend = {
          url: u.toString().replace(/\/$/, ""),
          apikey: apikey || "",
        };
        if (this.externalBackend.apikey)
          this.apiToken = this.externalBackend.apikey;
      } catch (error) {
        console.error("[backend] Invalid DAROX_EXTERNAL_BACKEND format", error);
      }
    }
  }

  getApiToken() {
    return this.apiToken;
  }
  attach(win: BrowserWindow) {
    this.win = win;
  }

  getAvailableProfiles(): string[] {
    if (this.externalBackend) return ["external"];
    try {
      const entries = fs.readdirSync(CONFIG_DIR, { withFileTypes: true });
      const profiles = entries
        .filter((entry) => {
          if (entry.name.startsWith("_")) return false;
          if (entry.isDirectory()) return true;
          if (!entry.isSymbolicLink()) return false;
          try {
            return fs.statSync(path.join(CONFIG_DIR, entry.name)).isDirectory();
          } catch {
            return false;
          }
        })
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
      return profiles.length > 0 ? profiles : ["coder"];
    } catch {
      return ["coder"];
    }
  }

  private resolveSettings(profile: string): ProfileLaunchSettings {
    const config = readConfig();
    const override = config.profiles[profile] ?? {};
    return {
      command: override.command ?? config.backend.command,
      commonArgs: config.backend.args,
      extraArgs: override.args ?? [],
      host: override.host ?? config.backend.host,
      port: override.port ?? config.backend.port,
      startupTimeoutMs:
        override.startupTimeoutMs ?? config.backend.startupTimeoutMs,
    };
  }

  getStatus(): any {
    if (this.externalBackend) {
      const portStr = new URL(this.externalBackend.url).port;
      const port = portStr
        ? Number(portStr)
        : this.externalBackend.url.startsWith("https")
          ? 443
          : 80;
      return {
        activeProfile: "external",
        instances: { external: { status: "Running", port } },
        profiles: ["external"],
        externalUrl: this.externalBackend.url,
      };
    }
    const instances: Record<string, any> = {};
    for (const [profile, inst] of this.instances) {
      instances[profile] = {
        ...inst.status,
        port: inst.port,
        host: inst.host,
        command: inst.command,
      };
    }
    const profiles = this.getAvailableProfiles();
    let configuredDefault: string | undefined;
    try {
      configuredDefault = readConfig().defaultProfile;
    } catch (error) {
      console.error("[backend] failed to read config", error);
    }
    return {
      activeProfile:
        this.activeProfile || configuredDefault || profiles[0] || "coder",
      instances,
      profiles,
    };
  }

  private emit() {
    if (this.win && !this.win.isDestroyed())
      this.win.webContents.send("backend-status", this.getStatus());
  }

  async startProfile(profile: string): Promise<number> {
    if (this.externalBackend) {
      this.activeProfile = "external";
      this.emit();
      const url = new URL(this.externalBackend.url);
      return url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    }
    let inst = this.instances.get(profile);
    if (
      inst?.status.status === "Running" ||
      inst?.status.status === "Starting"
    ) {
      this.activeProfile = profile;
      this.emit();
      return inst.port;
    }
    if (inst) await this.stopProfile(profile);

    let settings: ProfileLaunchSettings;
    try {
      settings = this.resolveSettings(profile);
    } catch (error) {
      const backendError = makeError(
        "invalid_config",
        (error as Error).message,
      );
      inst = {
        child: null,
        status: { status: "StartFailed", error: backendError },
        port: 0,
        host: "",
        shutdown: false,
        command: [],
      };
      this.instances.set(profile, inst);
      this.activeProfile = profile;
      this.emit();
      throw error;
    }
    let port: number;
    try {
      port =
        settings.port === "auto"
          ? await findPort(settings.host)
          : settings.port;
    } catch (error) {
      const backendError = makeError("spawn_error", (error as Error).message);
      inst = {
        child: null,
        status: { status: "StartFailed", error: backendError },
        port: 0,
        host: settings.host,
        shutdown: false,
        command: [],
      };
      this.instances.set(profile, inst);
      this.activeProfile = profile;
      this.emit();
      throw error;
    }
    const args = [
      ...settings.commonArgs,
      "--profile",
      profile,
      ...settings.extraArgs,
      "--ui",
      "vercel_ai",
      "--host",
      settings.host,
      "--port",
      String(port),
    ];
    const command = [settings.command, ...args];
    inst = {
      child: null,
      status: { status: "Starting" },
      port,
      host: settings.host,
      shutdown: false,
      command,
    };
    this.instances.set(profile, inst);
    this.activeProfile = profile;
    this.emit();
    console.log(`[backend] spawn: ${command.join(" ")}`);

    const child = spawn(settings.command, args, {
      stdio: ["ignore", "inherit", "pipe"],
      env: { ...process.env, AROX_API_TOKEN: this.apiToken },
    });
    inst.child = child;
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      stderr = `${stderr}${chunk.toString()}`.slice(-STDERR_LIMIT);
    });
    const spawnedAt = Date.now();

    return new Promise<number>((resolve, reject) => {
      let settled = false;
      const finishFailure = (error: BackendError, original?: Error) => {
        if (settled) return;
        settled = true;
        clearInterval(interval);
        clearTimeout(timeout);
        inst.child = null;
        inst.status = {
          status: "StartFailed",
          error: { ...error, stderr: stderr.trim() || error.stderr },
        };
        this.emit();
        reject(original ?? new Error(error.message));
      };
      const onError = (error: Error) =>
        finishFailure(
          makeError(
            (error as NodeJS.ErrnoException).code === "ENOENT"
              ? "command_not_found"
              : "spawn_error",
            error.message,
            undefined,
            stderr,
          ),
          error,
        );
      const onExit = (code: number | null) =>
        inst.shutdown
          ? (() => {
              if (settled) return;
              settled = true;
              clearInterval(interval);
              clearTimeout(timeout);
              reject(new Error("Backend startup was cancelled"));
            })()
          : finishFailure(
              makeError(
                "process_exit",
                `Backend exited before becoming healthy (code ${code ?? "unknown"})`,
                code,
                stderr,
              ),
            );
      child.once("error", onError);
      child.once("exit", onExit);
      const interval = setInterval(async () => {
        if (
          settled ||
          child.exitCode !== null ||
          Date.now() - spawnedAt < 500 ||
          !(await checkHealth(settings.host, port)) ||
          child.exitCode !== null
        )
          return;
        settled = true;
        clearInterval(interval);
        clearTimeout(timeout);
        child.off("error", onError);
        child.off("exit", onExit);
        inst.status = { status: "Running" };
        this.attachRuntimeMonitor(profile, inst, child, () => stderr);
        this.emit();
        resolve(port);
      }, 250);
      const timeout = setTimeout(() => {
        const error = makeError(
          "startup_timeout",
          `Backend did not become healthy within ${settings.startupTimeoutMs} ms`,
          undefined,
          stderr,
        );
        finishFailure(error);
        try {
          child.kill("SIGTERM");
        } catch {}
        setTimeout(() => {
          if (child.exitCode === null) {
            try {
              child.kill("SIGKILL");
            } catch {}
          }
        }, 5000);
      }, settings.startupTimeoutMs);
    });
  }

  private attachRuntimeMonitor(
    profile: string,
    inst: InstanceData,
    child: ChildProcess,
    getStderr: () => string,
  ) {
    child.once("exit", (code) => {
      if (inst.shutdown || inst.child !== child) return;
      inst.child = null;
      inst.status = {
        status: "Crashed",
        error: makeError(
          "process_exit",
          `Backend exited unexpectedly (code ${code ?? "unknown"})`,
          code,
          getStderr(),
        ),
      };
      console.warn(`[backend] ${profile} exited with code ${code}`);
      this.emit();
    });
  }

  async start(): Promise<number> {
    const profiles = this.getAvailableProfiles();
    const fallbackProfile = profiles[0] || "coder";
    try {
      const config = readConfig();
      const profile = config.defaultProfile || fallbackProfile;
      if (!profiles.includes(profile))
        throw configError(`defaultProfile ${profile} does not exist`);
      return this.startProfile(profile);
    } catch (error) {
      const backendError = makeError(
        "invalid_config",
        (error as Error).message,
      );
      this.instances.set(fallbackProfile, {
        child: null,
        status: { status: "StartFailed", error: backendError },
        port: 0,
        host: "",
        shutdown: false,
        command: [],
      });
      this.activeProfile = fallbackProfile;
      this.emit();
      throw error;
    }
  }

  async stopProfile(profile: string): Promise<void> {
    if (this.externalBackend) return;
    const inst = this.instances.get(profile);
    if (!inst) return;
    inst.shutdown = true;
    const child = inst.child;
    inst.child = null;
    inst.status = { status: "Stopped" };
    this.emit();
    if (!child) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      child.once("exit", finish);
      try {
        child.kill("SIGTERM");
      } catch {
        finish();
        return;
      }
      setTimeout(() => {
        if (!done) {
          try {
            child.kill("SIGKILL");
          } catch {}
          finish();
        }
      }, 5000);
    });
  }

  async stop(): Promise<void> {
    await Promise.all(
      [...this.instances.keys()].map((profile) => this.stopProfile(profile)),
    );
  }
  async restartProfile(profile: string): Promise<number> {
    await this.stopProfile(profile);
    return this.startProfile(profile);
  }
  async closeBackend(profile: string): Promise<void> {
    await this.stopProfile(profile);
  }
}
