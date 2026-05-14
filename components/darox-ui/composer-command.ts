// One-shot composer-scope command over the composer's WebSocket endpoint.
// Used for slash-equivalents like ForkEvent that target the composer
// itself rather than any individual agent.

export type ComposerCommandAck = {
  status: string;
  output?: string;
};

export function composerWsUrl(apiBase: string, composerId: string): string {
  const wsBase = apiBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return `${wsBase}/api/composers/${composerId}/ws`;
}

export function sendComposerCommand(
  apiBase: string,
  composerId: string,
  event: { type: string; [key: string]: unknown },
): Promise<ComposerCommandAck> {
  const url = composerWsUrl(apiBase, composerId);
  return new Promise<ComposerCommandAck>((resolve, reject) => {
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      reject(err);
      return;
    }
    const finish = (result: ComposerCommandAck | Error) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {}
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ command: event }));
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let msg: { type?: string; status?: string; output?: string } | null =
        null;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg && msg.type === "ack") {
        finish({ status: msg.status ?? "ok", output: msg.output });
      }
    };
    ws.onerror = () => {
      finish(new Error("composer ws error"));
    };
    ws.onclose = () => {
      if (!settled) finish(new Error("composer ws closed before ack"));
    };
  });
}
