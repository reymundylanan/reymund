import { describe, expect, it, vi } from "vitest";
import { getServiceReviewPage, REVIEWS_PAGE } from "./serviceReviews";

type Call = [string, ...unknown[]];

function fakeClient(reviewRows: unknown[], photoRows: unknown[] = []) {
  const calls: Record<string, Call[]> = {};
  const client = {
    from(table: string) {
      const list = (calls[table] = calls[table] ?? []);
      const result = { data: table === "review_photos" ? photoRows : reviewRows, error: null };
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      for (const m of ["select", "eq", "gt", "in", "order", "range"]) {
        builder[m] = (...args: unknown[]) => {
          list.push([m, ...args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { client: client as never, calls };
}

const row = (i: number) => ({
  id: `r${i}`, rating: 5, text: null, created_at: "2026-01-01", edited_at: null,
  reviewer: "Maria C.", staff_id: null, staff_name: null, service_date: null,
});

describe("getServiceReviewPage", () => {
  it("adds photo and star filters and requests one extra row", async () => {
    const a = fakeClient([]);
    await getServiceReviewPage(a.client, vi.fn(async () => new Map()), "s1", "photos", 20);
    expect(a.calls.public_service_reviews).toContainEqual(["gt", "photo_count", 0]);
    expect(a.calls.public_service_reviews).toContainEqual(["range", 20, 20 + REVIEWS_PAGE]);

    const b = fakeClient([]);
    await getServiceReviewPage(b.client, vi.fn(async () => new Map()), "s1", 4, 0);
    expect(b.calls.public_service_reviews).toContainEqual(["eq", "rating", 4]);
    expect(b.calls.public_service_reviews).not.toContainEqual(["gt", "photo_count", 0]);
  });

  it("reports hasMore only when an extra row comes back, trimming it", async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => row(i));
    const more = await getServiceReviewPage(fakeClient(eleven).client, vi.fn(async () => new Map()), "s1", "all", 0);
    expect(more.hasMore).toBe(true);
    expect(more.reviews).toHaveLength(10);

    const ten = await getServiceReviewPage(fakeClient(eleven.slice(0, 10)).client, vi.fn(async () => new Map()), "s1", "all", 0);
    expect(ten.hasMore).toBe(false);
  });

  it("fetches photos for the page ids and signs only those paths", async () => {
    const f = fakeClient(
      [row(0), row(1)],
      [{ review_id: "r0", storage_path: "u/a.jpg", position: 0 }, { review_id: "r0", storage_path: "u/b.jpg", position: 1 }]
    );
    const sign = vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `signed:${p}`])));
    const res = await getServiceReviewPage(f.client, sign, "s1", "all", 0);
    expect(f.calls.review_photos).toContainEqual(["in", "review_id", ["r0", "r1"]]);
    expect(sign).toHaveBeenCalledWith(["u/a.jpg", "u/b.jpg"]);
    expect(res.reviews[0].photos).toEqual(["signed:u/a.jpg", "signed:u/b.jpg"]);
    expect(res.reviews[1].photos).toEqual([]);
  });
});
