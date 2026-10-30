import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function deriveMachineKey(): Buffer {
  let machineId = "";
  for (const candidate of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      machineId = fs.readFileSync(candidate, "utf8").trim();
      if (machineId) break;
    } catch {
      // Try next candidate
    }
  }
  if (!machineId) {
    machineId = `${os.hostname()}-${os.platform()}-${os.arch()}`;
  }
  const username = os.userInfo().username || "darox";
  const salt = `darox:${username}:${os.homedir()}`;
  return crypto.scryptSync(machineId, salt, 32);
}

function encryptToken(token: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

function decryptToken(payload: string, key: Buffer): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 28) {
    throw new Error("Encrypted token payload is truncated.");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return (
    decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8")
  );
}

export function tokenCache(file: string, customKey?: Buffer) {
  const getKey = () => customKey || deriveMachineKey();

  return {
    read(url: string): string {
      if (!fs.existsSync(file)) return "";
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (saved.url !== url || !saved.token) return "";
      return decryptToken(saved.token, getKey());
    },
    write(url: string, token: string) {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const key = getKey();
      const data = JSON.stringify({
        url,
        token: encryptToken(token, key),
      });
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, data, { mode: 0o600 });
      fs.renameSync(temporary, file);
    },
  };
}
