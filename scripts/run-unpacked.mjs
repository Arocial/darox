import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getExecutablePath() {
  switch (process.platform) {
    case "linux":
      return path.join(root, "release", "linux-unpacked", "darox");
    case "darwin":
      return path.join(
        root,
        "release",
        "mac",
        "darox.app",
        "Contents",
        "MacOS",
        "darox",
      );
    case "win32":
      return path.join(root, "release", "win-unpacked", "darox.exe");
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

const exe = getExecutablePath();
if (!fs.existsSync(exe)) {
  console.error(
    `Executable not found at ${exe}. Run npm run electron:dir first.`,
  );
  process.exit(1);
}

const child = spawn(exe, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
