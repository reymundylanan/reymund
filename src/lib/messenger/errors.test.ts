import { describe, expect, it } from "vitest";
import { classifyGraphResponse, retryDelayMinutes } from "./errors";

const err = (code: number, error_subcode?: number) => ({ error: { message: `e${code}`, code, error_subcode } });

describe("classifyGraphResponse", () => {
  it("2xx is sent", () => expect(classifyGraphResponse(200, { message_id: "m" })).toEqual({ kind: "sent" }));

  it("unreachable/blocked users fail and opt out", () => {
    expect(classifyGraphResponse(400, err(551)).kind).toBe("fail_opt_out");
    expect(classifyGraphResponse(403, err(200, 1545041)).kind).toBe("fail_opt_out");
    expect(classifyGraphResponse(400, err(100, 2018001)).kind).toBe("fail_opt_out");
  });

  it("rate limits, temporary errors and 5xx retry", () => {
    expect(classifyGraphResponse(400, err(613)).kind).toBe("retry");
    expect(classifyGraphResponse(400, err(1200)).kind).toBe("retry");
    expect(classifyGraphResponse(429, null).kind).toBe("retry");
    expect(classifyGraphResponse(503, null).kind).toBe("retry");
  });

  it("other client errors fail with the Graph message", () => {
    expect(classifyGraphResponse(400, err(100))).toEqual({ kind: "fail", error: "e100" });
    expect(classifyGraphResponse(400, err(10, 2018278)).kind).toBe("fail");
  });
});

describe("retryDelayMinutes", () => {
  it("backs off 1/5/15/60 then gives up after 5 attempts", () => {
    expect([1, 2, 3, 4].map(retryDelayMinutes)).toEqual([1, 5, 15, 60]);
    expect(retryDelayMinutes(5)).toBeNull();
  });
});
