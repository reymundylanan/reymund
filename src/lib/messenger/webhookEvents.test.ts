import { describe, expect, it } from "vitest";
import { parseMessagingEvent } from "./webhookEvents";

describe("parseMessagingEvent", () => {
  it("links from an existing-thread referral", () => {
    expect(parseMessagingEvent({ sender: { id: "u1" }, referral: { ref: "tok" } })).toEqual({
      type: "link",
      psid: "u1",
      ref: "tok",
    });
  });

  it("links from a Get Started postback referral", () => {
    expect(
      parseMessagingEvent({ sender: { id: "u1" }, postback: { payload: "GET_STARTED", referral: { ref: "tok" } } })
    ).toEqual({ type: "link", psid: "u1", ref: "tok" });
  });

  it("handles STOP and START case-insensitively", () => {
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "  stop " } })).toEqual({ type: "stop", psid: "u1" });
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "Start" } })).toEqual({ type: "start", psid: "u1" });
  });

  it("treats other messages and postbacks as inbound", () => {
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "hello" } })).toEqual({ type: "inbound", psid: "u1" });
    expect(parseMessagingEvent({ sender: { id: "u1" }, postback: { payload: "X" } })).toEqual({ type: "inbound", psid: "u1" });
  });

  it("ignores echoes, missing senders, and delivery/read events", () => {
    expect(parseMessagingEvent({ sender: { id: "page" }, message: { text: "hi", is_echo: true } })).toEqual({ type: "ignore" });
    expect(parseMessagingEvent({ message: { text: "hi" } })).toEqual({ type: "ignore" });
    expect(parseMessagingEvent({ sender: { id: "u1" } })).toEqual({ type: "ignore" });
  });
});
