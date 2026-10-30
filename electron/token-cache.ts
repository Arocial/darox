import fs from "node:fs";
import path from "node:path";

interface Encryption {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export function tokenCache(file: string, encryption: Encryption) {
  const available = () =>
    encryption.isEncryptionAvailable() &&
    encryption.getSelectedStorageBackend?.() !== "basic_text";
  return {
    read(url: string): string {
      if (!fs.existsSync(file)) return "";
      if (!available())
        throw new Error("System secure storage is unavailable.");
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      return saved.url === url
        ? encryption.decryptString(Buffer.from(saved.token, "base64"))
        : "";
    },
    write(url: string, token: string) {
      if (!available())
        throw new Error(
          "System secure storage is unavailable; the Manager token was not cached.",
        );
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const data = JSON.stringify({
        url,
        token: encryption.encryptString(token).toString("base64"),
      });
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, data, { mode: 0o600 });
      fs.renameSync(temporary, file);
    },
  };
}
