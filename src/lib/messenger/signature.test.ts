import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeEqual, verifySignature } from "./signature";

const body = '{"object":"page","entry":[]}';
const sign = (b: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(b).digest("hex");

describe("verifySignature", () => {
  it("accepts a valid signature (string and Buffer bodies)", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
    expect(verifySignature(Buffer.from(body), sign(body, "s3cret"), "s3cret")).toBe(true);
  });

  it("rejects tampered body, wrong secret, missing or malformed header", () => {
    expect(verifySignature(body + " ", sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "sha1=abc", "s3cret")).toBe(false);
  });

  it("safeEqual handles different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
