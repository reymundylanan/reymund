import { GRAPH_VERSION, type MessengerConfig } from "./config";
import { BOT_METADATA } from "./webhookEvents";

/** Tags every message GlowSync sends, so its echo isn't mistaken for a
 * staff member typing in the Page inbox (which pauses the chatbot). */
export function withBotMetadata(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const p = payload as { message?: Record<string, unknown> };
  if (!p.message || typeof p.message !== "object" || "metadata" in p.message) return payload;
  return { ...p, message: { ...p.message, metadata: BOT_METADATA } };
}

export async function sendToGraph(config: MessengerConfig, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.pageId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.pageAccessToken}`,
    },
    body: JSON.stringify(withBotMetadata(payload)),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
