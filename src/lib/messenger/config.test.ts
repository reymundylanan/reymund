import { describe, expect, it } from "vitest";
import { getMessengerConfig, missingMessengerEnv } from "./config";

const full = {
  MESSENGER_PAGE_ID: "123",
  MESSENGER_PAGE_ACCESS_TOKEN: "tok",
  MESSENGER_APP_SECRET: "sec",
  MESSENGER_VERIFY_TOKEN: "ver",
  MESSENGER_DISPATCH_SECRET: "dis",
  NEXT_PUBLIC_MESSENGER_PAGE_USERNAME: "blushspa",
  NEXT_PUBLIC_SITE_URL: "https://glow.example/",
};

describe("messenger config", () => {
  it("returns config with trailing slash trimmed", () => {
    expect(getMessengerConfig(full)?.siteUrl).toBe("https://glow.example");
    expect(missingMessengerEnv(full)).toEqual([]);
  });

  it("reports missing vars and returns null", () => {
    const env = { ...full, MESSENGER_APP_SECRET: "", MESSENGER_PAGE_ID: undefined };
    expect(missingMessengerEnv(env)).toEqual(["MESSENGER_PAGE_ID", "MESSENGER_APP_SECRET"]);
    expect(getMessengerConfig(env)).toBeNull();
  });
});
