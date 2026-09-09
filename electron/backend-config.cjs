const MANAGED_ARGS = new Set(["--profile", "--ui", "--host", "--port"]);

function parseBackendConfig(value, error = (message) => new Error(message)) {
  const root = objectValue(value, "root", error);
  const backendValue = objectValue(root.backend ?? {}, "backend", error);
  const profilesValue = objectValue(root.profiles ?? {}, "profiles", error);
  const backend = {
    command: stringValue(
      backendValue.command ?? "arox",
      "backend.command",
      error,
    ),
    args: argsValue(backendValue.args ?? [], "backend.args", error),
    host: stringValue(backendValue.host ?? "127.0.0.1", "backend.host", error),
    port: portValue(backendValue.port ?? "auto", "backend.port", error),
    startupTimeoutMs: positiveNumber(
      backendValue.startupTimeoutMs ?? 30_000,
      "backend.startupTimeoutMs",
      error,
    ),
  };
  const profiles = {};

  for (const [name, value] of Object.entries(profilesValue)) {
    const item = objectValue(value, `profiles.${name}`, error);
    const profile = {};
    if (item.command !== undefined)
      profile.command = stringValue(
        item.command,
        `profiles.${name}.command`,
        error,
      );
    if (item.args !== undefined)
      profile.args = argsValue(item.args, `profiles.${name}.args`, error);
    if (item.host !== undefined)
      profile.host = stringValue(item.host, `profiles.${name}.host`, error);
    if (item.port !== undefined)
      profile.port = portValue(item.port, `profiles.${name}.port`, error);
    if (item.startupTimeoutMs !== undefined)
      profile.startupTimeoutMs = positiveNumber(
        item.startupTimeoutMs,
        `profiles.${name}.startupTimeoutMs`,
        error,
      );
    if (item.autostart !== undefined) {
      if (typeof item.autostart !== "boolean")
        throw error(`profiles.${name}.autostart must be boolean`);
      profile.autostart = item.autostart;
    }
    profiles[name] = profile;
  }

  return {
    defaultProfile:
      root.defaultProfile === undefined
        ? undefined
        : String(root.defaultProfile),
    backend,
    profiles,
  };
}

function objectValue(value, field, error) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw error(`${field} must be an object`);
  return value;
}

function stringValue(value, field, error) {
  if (typeof value !== "string" || !value.trim())
    throw error(`${field} must be a non-empty string`);
  return value;
}

function argsValue(value, field, error) {
  if (!Array.isArray(value) || !value.every((arg) => typeof arg === "string"))
    throw error(`${field} must be an array of strings`);
  for (const argument of value) {
    const name = argument.split("=", 1)[0];
    if (MANAGED_ARGS.has(name))
      throw error(`${field} cannot override managed argument ${name}`);
  }
  return value;
}

function portValue(value, field, error) {
  if (value === "auto") return value;
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw error(`${field} must be "auto" or an integer from 1 to 65535`);
  return value;
}

function positiveNumber(value, field, error) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1)
    throw error(`${field} must be a positive number`);
  return number;
}

module.exports = { parseBackendConfig };
