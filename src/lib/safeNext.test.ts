import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it.each(["/", "/my-glow", "/my-glow/appointments/abc", "/?intent=booking", "/promos/1?x=a%20b"])(
    "accepts same-site path %s",
    (v) => expect(safeNext(v)).toBe(v)
  );

  it.each([
    null,
    undefined,
    "",
    "@evil.com",
    "evil.com",
    "//evil.com",
    "/\\evil.com",
    "/foo\\bar",
    "https://evil.com",
    "javascript:alert(1)",
    "/\t/evil.com",
    "/\n/evil.com",
  ])("rejects %s", (v) => expect(safeNext(v)).toBe("/"));
});
