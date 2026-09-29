import { GRAPH_VERSION, type MessengerConfig } from "./config";

export async function sendToGraph(config: MessengerConfig, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.pageId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.pageAccessToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
