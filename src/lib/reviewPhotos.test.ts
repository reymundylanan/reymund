import { describe, expect, it } from "vitest";
import { fitWithin, reviewPhotoPath, validateReviewPhoto } from "./reviewPhotos";

describe("validateReviewPhoto", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s up to 5 MB", (type) => {
    expect(validateReviewPhoto({ type, size: 5 * 1024 * 1024 })).toBeNull();
  });
  it("rejects other types and big files", () => {
    const msg = "Use JPG, PNG or WebP photos up to 5 MB each.";
    expect(validateReviewPhoto({ type: "image/gif", size: 10 })).toBe(msg);
    expect(validateReviewPhoto({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 })).toBe(msg);
  });
});

describe("fitWithin", () => {
  it("keeps small images", () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
  it("scales the long side to 1600", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
});

it("builds the storage path", () => {
  expect(reviewPhotoPath("u1", "a1", "p1")).toBe("u1/a1/p1.jpg");
});
