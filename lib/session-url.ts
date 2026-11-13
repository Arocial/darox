export function sessionApiUrl(
  apiBase: string,
  sessionPath: string,
  endpoint: "ws" | "suggestions",
): string {
  const path = sessionPath.split("/").map(encodeURIComponent).join("/");
  return `${apiBase.replace(/\/$/, "")}/api/sessions/${path}/${endpoint}`;
}
