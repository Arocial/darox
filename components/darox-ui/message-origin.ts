export type MessageOrigin = "user" | "shell" | "collaboration";

/** Only the backend's recognized custom origins opt into notification styling. */
export function getMessageOrigin(metadata: unknown): MessageOrigin {
  if (!metadata || typeof metadata !== "object" || !("custom" in metadata))
    return "user";
  const custom = metadata.custom;
  if (!custom || typeof custom !== "object" || !("origin" in custom))
    return "user";
  return custom.origin === "shell" || custom.origin === "collaboration"
    ? custom.origin
    : "user";
}
