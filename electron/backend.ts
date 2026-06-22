import { spawn, type ChildProcess } from "node:child_process";
import { createServer, createConnection } from "node:net";
import type { BrowserWindow } from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

export type ProcessStatus =
  | { status: "Stopped" }
  | { status: "Starting" }
  | { status: "Running" }
  | { status: "Crashed"; exit_code: number | null };

const HOST = "127.0.0.1";

function parseArgs(str: string): string[] {
  const result: string[] = [];
  let current = "";
  let inDoubleQuote = false;
  let inSingleQuote = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === " " && !inDoubleQuote && !inSingleQuote) {
      if (current.length > 0) {
        result.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    result.push(current);
  }
  return result;
}

function findPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, HOST, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error("Failed to get port"));
      }
    });
  });
}

function checkHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: HOST, port });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

export interface InstanceData {
  child: ChildProcess | null;
  status: ProcessStatus;
  port: number;
  restartCount: number;
  shutdown: boolean;
}

export class BackendManager {
  private instances = new Map<string, InstanceData>();
  private activeProfile: string | null = null;
  private win: BrowserWindow | null = null;
  private apiToken = randomBytes(32).toString("hex");

  getApiToken(): string {
    return this.apiToken;
  }

  attach(win: BrowserWindow) {
    this.win = win;
  }

  getAvailableProfiles(): string[] {
    try {
      const dir = path.join(os.homedir(), ".config/arox/profiles/chat");
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const profiles = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
        .map((e) => e.name);
      if (profiles.length === 0) return ["coder"];
      return profiles;
    } catch {
      return ["coder"];
    }
  }

  getStatus(): any {
    const map: Record<string, any> = {};
    for (const [profile, inst] of this.instances.entries()) {
      map[profile] =
        inst.status.status === "Crashed"
          ? {
              status: "Crashed",
              exit_code: (inst.status as any).exit_code,
              port: inst.port,
            }
          : { status: inst.status.status, port: inst.port };
    }
    const profiles = this.getAvailableProfiles();
    const active =
      this.activeProfile || (profiles.length > 0 ? profiles[0] : "coder");
    return {
      activeProfile: active,
      instances: map,
      profiles,
    };
  }

  private emit() {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send("backend-status", this.getStatus());
  }

  private spawnProc(profile: string, port: number): ChildProcess {
    const cmd = `arox --profile ${profile}`;
    const parts = parseArgs(cmd);
    const [bin, ...rest] = parts;
    const args = [
      ...rest,
      "--ui",
      "vercel_ai",
      "--host",
      HOST,
      "--port",
      String(port),
    ];
    console.log(`[backend] spawn: ${bin} ${args.join(" ")}`);
    const child = spawn(bin, args, {
      stdio: "inherit",
      env: { ...process.env, DAROX_API_TOKEN: this.apiToken },
    });
    child.on("error", (err) => {
      console.error(`[backend] spawn error for ${profile}:`, err);
    });
    return child;
  }

  async startProfile(profile: string): Promise<number> {
    let inst = this.instances.get(profile);
    if (!inst) {
      inst = {
        child: null,
        status: { status: "Stopped" },
        port: 0,
        restartCount: 0,
        shutdown: false,
      };
      this.instances.set(profile, inst);
    } else {
      if (
        inst.status.status === "Running" ||
        inst.status.status === "Starting"
      ) {
        this.activeProfile = profile;
        this.emit();
        return inst.port;
      }
      await this.stopProfile(profile);
      inst.shutdown = false;
    }

    inst.restartCount = 0;
    inst.port = await findPort();
    inst.child = this.spawnProc(profile, inst.port);
    inst.status = { status: "Starting" };

    this.activeProfile = profile;
    this.emit();
    this.attachMonitor(profile, inst);
    this.healthLoop(profile, inst);
    return inst.port;
  }

  async start(): Promise<number> {
    const profiles = this.getAvailableProfiles();
    const profile = profiles.length > 0 ? profiles[0] : "coder";
    return this.startProfile(profile);
  }

  private async healthLoop(profile: string, inst: InstanceData) {
    const targetPort = inst.port;
    while (!inst.shutdown && inst.port === targetPort) {
      await new Promise((r) => setTimeout(r, 2000));
      if (inst.shutdown || inst.port !== targetPort) break;
      if (inst.status.status === "Starting" && (await checkHealth(inst.port))) {
        inst.status = { status: "Running" };
        inst.restartCount = 0;
        if (this.activeProfile === profile) {
          console.log(`[backend] ${profile} running on ${HOST}:${inst.port}`);
        }
        this.emit();
      }
    }
  }

  private attachMonitor(profile: string, inst: InstanceData) {
    const child = inst.child;
    if (!child) return;
    child.on("exit", async (code) => {
      if (inst.shutdown) return;
      if (inst.child !== child) return;
      inst.child = null;
      inst.status = { status: "Crashed", exit_code: code };
      this.emit();
      console.warn(`[backend] ${profile} exited with code ${code}`);

      const delaySec = Math.min(2 ** inst.restartCount, 30);
      inst.restartCount++;
      await new Promise((r) => setTimeout(r, delaySec * 1000));
      if (inst.shutdown) return;

      try {
        const next = this.spawnProc(profile, inst.port);
        inst.child = next;
        inst.status = { status: "Starting" };
        this.emit();
        this.attachMonitor(profile, inst);
        this.healthLoop(profile, inst);
      } catch (e) {
        console.error(`[backend] ${profile} failed to restart:`, e);
      }
    });
  }

  async stopProfile(profile: string): Promise<void> {
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
        if (done) return;
        done = true;
        resolve();
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
    const promises = [];
    for (const profile of this.instances.keys()) {
      promises.push(this.stopProfile(profile));
    }
    await Promise.all(promises);
  }

  async restart(): Promise<number> {
    if (!this.activeProfile) return this.start();
    await this.stopProfile(this.activeProfile);
    return this.startProfile(this.activeProfile);
  }

  async closeBackend(profile: string): Promise<void> {
    await this.stopProfile(profile);
  }
}
