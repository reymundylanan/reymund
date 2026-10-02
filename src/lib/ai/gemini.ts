export const GEMINI_REVIEW_MODEL = "gemini-2.5-flash-lite";
export type GeminiImage = { mimeType: string; base64: string };

/** Tried in order. Each model has its own free-tier quota, so when one is
 * used up (429) or retired (404) the next one answers instead. */
export const GEMINI_MODELS = [GEMINI_REVIEW_MODEL, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

export class GeminiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
  /** Out of quota on every model (or the service is down) — not a bad request. */
  get unavailable() {
    return this.status === 429 || this.status === 404 || this.status >= 500;
  }
}

const RETRY_NEXT_MODEL = new Set([404, 429, 500, 503]);

/** generateContent with model fallback; returns the first candidate's text. */
export async function geminiGenerate(body: object, timeoutMs = 25_000): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError(500, "GEMINI_API_KEY is not set");
  let last: GeminiError | null = null;
  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      }
      const err = await res.json().catch(() => null);
      last = new GeminiError(res.status, `Gemini ${res.status} (${model}): ${err?.error?.message ?? "request failed"}`);
      if (!RETRY_NEXT_MODEL.has(res.status)) throw last;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last ?? new GeminiError(503, "Gemini unavailable");
}

export async function geminiJson(opts: {
  system: string;
  text: string;
  images: GeminiImage[];
  schema: object;
  timeoutMs: number;
}): Promise<unknown> {
  return geminiGenerate(
    {
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
    },
    opts.timeoutMs
  );
}

/** Multi-turn chat with a JSON answer (AI Review Assistant). */
export async function geminiChatJson(opts: {
  system: string;
  turns: { role: "user" | "model"; text: string }[];
  schema: object;
  timeoutMs: number;
}): Promise<string | null> {
  return geminiGenerate(
    {
      system_instruction: { parts: [{ text: opts.system }] },
      contents: opts.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      generationConfig: { responseMimeType: "application/json", responseSchema: opts.schema, temperature: 0.2 },
    },
    opts.timeoutMs
  );
}
