import { describe, expect, it, vi } from "vitest";
import { saveVisitReview, type VisitReviewDraft } from "./visitReviews";

function fakeClient(opts: { failUploadAt?: number; rpcError?: string; rpcThrows?: boolean; editReturns?: string[]; tagsError?: string }) {
  const uploaded: string[] = [];
  const removed: string[][] = [];
  let n = 0;
  const bucket = {
    upload: vi.fn(async (path: string) => {
      n += 1;
      if (opts.failUploadAt === n) return { error: { message: "boom" } };
      uploaded.push(path);
      return { error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      removed.push(paths);
      return { error: null };
    }),
  };
  const rpc = vi.fn(async (name?: string, args?: unknown) => {
    void args;
    if (name === "set_visit_review_tags") {
      return opts.tagsError ? { data: null, error: { message: opts.tagsError } } : { data: null, error: null };
    }
    if (opts.rpcThrows) throw new Error("network down");
    return opts.rpcError !== undefined
      ? { data: null, error: { message: opts.rpcError } }
      : { data: opts.editReturns ?? null, error: null };
  });
  return { client: { storage: { from: () => bucket }, rpc } as never, uploaded, removed, rpc };
}

const draft = (add: number, tags: string[] = []): VisitReviewDraft => ({
  appointmentId: "a1",
  services: [{ position: 0, rating: 5, text: "Great", tags, keep: ["u1/a1/old.jpg"], add: Array.from({ length: add }, () => new Blob(["x"])) }],
  staff: { rating: 4, text: "" },
  branch: null,
});

describe("saveVisitReview", () => {
  it("uploads, then submits paths in order", async () => {
    const f = fakeClient({});
    const res = await saveVisitReview(f.client, "u1", draft(2), "submit");
    expect(res.error).toBeNull();
    const args = f.rpc.mock.calls[0] as unknown as [string, { p_services: { photos: string[] }[] }];
    expect(args[0]).toBe("submit_visit_review");
    expect(args[1].p_services[0].photos).toEqual(["u1/a1/old.jpg", ...f.uploaded]);
  });

  it("cleans up uploaded files when an upload fails midway", async () => {
    const f = fakeClient({ failUploadAt: 2 });
    const res = await saveVisitReview(f.client, "u1", draft(3), "submit");
    expect(res.error).toBe("Couldn't upload your photos. Please try again.");
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.removed).toEqual([f.uploaded]);
  });

  it("cleans up new uploads when the RPC rejects", async () => {
    const f = fakeClient({ rpcError: "REVIEW_INAPPROPRIATE" });
    const res = await saveVisitReview(f.client, "u1", draft(1), "submit");
    expect(res.code).toBe("REVIEW_INAPPROPRIATE");
    expect(f.removed).toEqual([f.uploaded]);
  });

  it("returns an error (never throws) and removes uploads when the RPC throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeClient({ rpcThrows: true });
    const res = await saveVisitReview(f.client, "u1", draft(2), "submit");
    expect(res).toEqual({ error: "Couldn't save your review. Please try again.", code: null });
    expect(f.removed).toEqual([f.uploaded]);
    spy.mockRestore();
  });

  it("uses code UNKNOWN when the RPC error has no message", async () => {
    const f = fakeClient({ rpcError: "  " });
    const res = await saveVisitReview(f.client, "u1", draft(1), "submit");
    expect(res.code).toBe("UNKNOWN");
    expect(res.error).toBeNull();
    expect(f.removed).toEqual([f.uploaded]);
  });

  it("deletes files the edit no longer uses", async () => {
    const f = fakeClient({ editReturns: ["u1/a1/gone.jpg"] });
    await saveVisitReview(f.client, "u1", draft(0), "edit");
    expect((f.rpc.mock.calls[0] as unknown[])[0]).toBe("edit_visit_review");
    expect(f.removed).toEqual([["u1/a1/gone.jpg"]]);
  });

  it("does not call the tags RPC when no part has tags", async () => {
    const f = fakeClient({});
    await saveVisitReview(f.client, "u1", draft(0), "submit");
    expect(f.rpc.mock.calls.map((c) => c[0])).toEqual(["submit_visit_review"]);
  });

  it("saves tags after a successful submit", async () => {
    const f = fakeClient({});
    const res = await saveVisitReview(f.client, "u1", draft(0, ["Clean"]), "submit");
    expect(res.error).toBeNull();
    expect(f.rpc).toHaveBeenLastCalledWith("set_visit_review_tags", {
      p_appointment_id: "a1",
      p_tags: [{ position: 0, tags: ["Clean"] }],
    });
  });

  it("on edit, sends empty tags so clearing them is saved", async () => {
    const f = fakeClient({});
    await saveVisitReview(f.client, "u1", draft(0), "edit");
    expect(f.rpc).toHaveBeenLastCalledWith("set_visit_review_tags", {
      p_appointment_id: "a1",
      p_tags: [{ position: 0, tags: [] }],
    });
  });

  it("logs a failing tags RPC without failing the save", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeClient({ tagsError: "relation missing" });
    const res = await saveVisitReview(f.client, "u1", draft(0, ["Clean"]), "submit");
    expect(res).toEqual({ error: null, code: null });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
