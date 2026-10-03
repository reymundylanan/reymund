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

  it("treats other messages and postbacks as inbound, with their text", () => {
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: " hello " } })).toEqual({ type: "inbound", psid: "u1", text: "hello" });
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: {} })).toEqual({ type: "inbound", psid: "u1", text: null });
    expect(parseMessagingEvent({ sender: { id: "u1" }, postback: { payload: "X", title: "Prices" } })).toEqual({
      type: "inbound",
      psid: "u1",
      text: "Prices",
    });
    expect(parseMessagingEvent({ sender: { id: "u1" }, postback: { payload: "GET_STARTED", title: "Get Started" } })).toEqual({
      type: "inbound",
      psid: "u1",
      text: null,
    });
  });

  it("hands over to staff on request", () => {
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "STAFF" } })).toEqual({ type: "staff", psid: "u1" });
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "talk to a person" } })).toEqual({ type: "staff", psid: "u1" });
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "is the staff friendly?" } }).type).toBe("inbound");
  });

  it("pauses for staff replies but not for GlowSync's own echoes", () => {
    expect(parseMessagingEvent({ sender: { id: "page" }, recipient: { id: "u1" }, message: { text: "hi po", is_echo: true } })).toEqual({
      type: "staff_replied",
      psid: "u1",
    });
    expect(
      parseMessagingEvent({ sender: { id: "page" }, recipient: { id: "u1" }, message: { text: "hi", is_echo: true, metadata: "glowsync" } })
    ).toEqual({ type: "ignore" });
  });

  it("ignores echoes, missing senders, and delivery/read events", () => {
    expect(parseMessagingEvent({ sender: { id: "page" }, message: { text: "hi", is_echo: true } })).toEqual({ type: "ignore" });
    expect(parseMessagingEvent({ message: { text: "hi" } })).toEqual({ type: "ignore" });
    expect(parseMessagingEvent({ sender: { id: "u1" } })).toEqual({ type: "ignore" });
  });
});
