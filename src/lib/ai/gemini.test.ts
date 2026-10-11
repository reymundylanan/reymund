import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEMINI_MODELS, GeminiError, geminiGenerate } from "./gemini";

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const fail = (status: number) => new Response(JSON.stringify({ error: { message: "nope" } }), { status });
const modelOf = (url: string) => url.match(/models\/([^:]+):/)?.[1];

describe("geminiGenerate", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("moves on to the next model when one can't be reached", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (modelOf(url) === GEMINI_MODELS[0]) throw new TypeError("fetch failed");
      return ok("hello");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(geminiGenerate({})).resolves.toBe("hello");
    expect(fetchMock.mock.calls.map(([u]) => modelOf(u as string))).toEqual([GEMINI_MODELS[0], GEMINI_MODELS[1]]);
  });

  it("moves on when a model hangs, within the overall budget", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        if (modelOf(url) !== GEMINI_MODELS[0]) return Promise.resolve(ok("second"));
        return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      })
    );
    const p = geminiGenerate({}, 20_000);
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(p).resolves.toBe("second");
  });

  it("skips retired models (404) and stops on a real error (400)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (modelOf(url) === GEMINI_MODELS[0] ? fail(404) : fail(400))));
    await expect(geminiGenerate({})).rejects.toMatchObject({ status: 400 });
  });

  it("gives up with an 'unavailable' error when every model fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const err = await geminiGenerate({}).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as GeminiError).unavailable).toBe(true);
  });
});
