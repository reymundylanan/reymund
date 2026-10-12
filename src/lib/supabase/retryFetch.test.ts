import { describe, expect, it, vi } from "vitest";
import { retryingFetch } from "./retryFetch";

const ok = () => new Response("{}", { status: 200 });
const drop = () => Promise.reject(new TypeError("fetch failed"));

describe("retryingFetch", () => {
  it("tries a read again after a dropped connection", async () => {
    const base = vi.fn().mockImplementationOnce(drop).mockImplementationOnce(drop).mockResolvedValue(ok());
    const res = await retryingFetch(base, { delayMs: 0 })("https://x.test/rest/v1/branches");
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last retry", async () => {
    const base = vi.fn().mockImplementation(drop);
    await expect(retryingFetch(base, { delayMs: 0 })("https://x.test/a")).rejects.toThrow("fetch failed");
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("never re-sends a save", async () => {
    const base = vi.fn().mockImplementation(drop);
    await expect(retryingFetch(base, { delayMs: 0 })("https://x.test/rpc/save", { method: "POST" })).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("returns HTTP errors as they are, and doesn't retry a cancelled request", async () => {
    const notFound = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    expect((await retryingFetch(notFound, { delayMs: 0 })("https://x.test/a")).status).toBe(404);
    expect(notFound).toHaveBeenCalledTimes(1);

    const aborted = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(retryingFetch(aborted, { delayMs: 0 })("https://x.test/a")).rejects.toThrow();
    expect(aborted).toHaveBeenCalledTimes(1);
  });
});
