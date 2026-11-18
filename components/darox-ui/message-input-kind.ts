export type MessageInputKind = "user" | "shell" | "collaboration";

/** Only the backend's recognized input kinds opt into notification styling. */
export function getMessageInputKind(metadata: unknown): MessageInputKind {
  if (!metadata || typeof metadata !== "object" || !("custom" in metadata))
    return "user";
  const custom = metadata.custom;
  if (!custom || typeof custom !== "object" || !("input_kind" in custom))
    return "user";
  return custom.input_kind === "shell" || custom.input_kind === "collaboration"
    ? custom.input_kind
    : "user";
}
