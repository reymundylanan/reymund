export const GEMINI_REVIEW_MODEL = "gemini-2.5-flash-lite";
export type GeminiImage = { mimeType: string; base64: string };

export async function geminiJson(opts: {
  system: string;
  text: string;
  images: GeminiImage[];
  schema: object;
  timeoutMs: number;
}): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_REVIEW_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: opts.text },
                ...opts.images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", responseSchema: opts.schema, temperature: 0 },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(`Gemini ${res.status}: ${body?.error?.message ?? "request failed"}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } finally {
    clearTimeout(timer);
  }
}

/** Multi-turn chat with a JSON answer (AI Review Assistant). */
export async function geminiChatJson(opts: {
  system: string;
  turns: { role: "user" | "model"; text: string }[];
  schema: object;
  timeoutMs: number;
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_REVIEW_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: opts.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          generationConfig: { responseMimeType: "application/json", responseSchema: opts.schema, temperature: 0.2 },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(`Gemini ${res.status}: ${body?.error?.message ?? "request failed"}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } finally {
    clearTimeout(timer);
  }
}
