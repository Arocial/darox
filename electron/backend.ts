import { spawn, type ChildProcess } from "node:child_process";
import { createServer, createConnection } from "node:net";
import type { BrowserWindow } from "electron";

export type ProcessStatus =
  | { status: "Stopped" }
  | { status: "Starting" }
  | { status: "Running" }
  | { status: "Crashed"; exit_code: number | null };

const HOST = "127.0.0.1";

function getBackendCommand(): string {
  const argv = process.argv;
  const i = argv.indexOf("--backend");
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return "arox --profile coder";
}

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

export class BackendManager {
  private child: ChildProcess | null = null;
  private status: ProcessStatus = { status: "Stopped" };
  private port = 0;
  private restartCount = 0;
  private shutdown = false;
  private win: BrowserWindow | null = null;

  attach(win: BrowserWindow) {
    this.win = win;
  }

  getStatus(): [ProcessStatus, number] {
    return [this.status, this.port];
  }

  private emit() {
    if (!this.win || this.win.isDestroyed()) return;
    const s = this.status;
    const payload =
      s.status === "Crashed"
        ? { status: "Crashed", exit_code: s.exit_code, port: this.port }
        : { status: s.status, port: this.port };
    this.win.webContents.send("backend-status", payload);
  }

  private spawnProc(port: number): ChildProcess {
    const cmd = getBackendCommand();
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
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", (err) => {
      console.error("[backend] spawn error:", err);
    });
    return child;
  }

  async start(): Promise<number> {
    await this.stop();
    this.shutdown = false;
    this.restartCount = 0;
    this.port = await findPort();
    this.child = this.spawnProc(this.port);
    this.status = { status: "Starting" };
    this.emit();
    this.attachMonitor(this.child);
    this.healthLoop();
    return this.port;
  }

  private async healthLoop() {
    const targetPort = this.port;
    while (!this.shutdown && this.port === targetPort) {
      await new Promise((r) => setTimeout(r, 2000));
      if (this.shutdown || this.port !== targetPort) break;
      if (this.status.status === "Starting" && (await checkHealth(this.port))) {
        this.status = { status: "Running" };
        this.restartCount = 0;
        this.emit();
        console.log(`[backend] running on ${HOST}:${this.port}`);
      }
    }
  }

  private attachMonitor(child: ChildProcess) {
    child.on("exit", async (code) => {
      if (this.shutdown) return;
      if (this.child !== child) return; // superseded by a newer process
      this.child = null;
      this.status = { status: "Crashed", exit_code: code };
      this.emit();
      console.warn(`[backend] exited with code ${code}`);

      const delaySec = Math.min(2 ** this.restartCount, 30);
      this.restartCount++;
      await new Promise((r) => setTimeout(r, delaySec * 1000));
      if (this.shutdown) return;

      try {
        const next = this.spawnProc(this.port);
        this.child = next;
        this.status = { status: "Starting" };
        this.emit();
        this.attachMonitor(next);
        this.healthLoop();
      } catch (e) {
        console.error("[backend] failed to restart:", e);
      }
    });
  }

  async stop(): Promise<void> {
    this.shutdown = true;
    const child = this.child;
    this.child = null;
    this.status = { status: "Stopped" };
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
          } catch {
            // ignore
          }
          finish();
        }
      }, 5000);
    });
  }

  async restart(): Promise<number> {
    await this.stop();
    return this.start();
  }
}
