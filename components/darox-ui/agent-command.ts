// One-shot command over a session node's WebSocket endpoint.

export type AgentCommandAck = {
  status: string;
  output?: string;
};

import { appendWsToken } from "@/lib/api";

export function agentWsUrl(
  apiBase: string,
  rootSessionId: string,
  targetSessionId: string,
): string {
  const wsBase = apiBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return appendWsToken(
    `${wsBase}/api/sessions/${rootSessionId}/nodes/${targetSessionId}/ws`,
  );
}

export function sendAgentCommand(
  apiBase: string,
  agentId: string,
  subagentId: string,
  event: { type: string; [key: string]: unknown },
): Promise<AgentCommandAck> {
  const url = agentWsUrl(apiBase, agentId, subagentId);
  return new Promise<AgentCommandAck>((resolve, reject) => {
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      reject(err);
      return;
    }
    const finish = (result: AgentCommandAck | Error) => {
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
      finish(new Error("agent ws error"));
    };
    ws.onclose = () => {
      if (!settled) finish(new Error("agent ws closed before ack"));
    };
  });
}
