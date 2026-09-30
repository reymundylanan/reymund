import { describe, expect, it } from "vitest";
import { templateCreatePayload } from "./templates";

type Payload = {
  category: string;
  components: {
    type: string;
    text?: string;
    buttons?: { text: string; url: string; example: { url_suffix_example: string } }[];
  }[];
};

function parts(kind: Parameters<typeof templateCreatePayload>[0]) {
  const p = templateCreatePayload(kind, "https://x.test") as unknown as Payload;
  return {
    body: p.components.find((c) => c.type === "BODY")!,
    button: p.components.find((c) => c.type === "BUTTONS")!.buttons![0],
    category: p.category,
  };
}

describe("templateCreatePayload", () => {
  it("builds the review request utility template with its own button", () => {
    const { body, button, category } = parts("review_request");
    expect(category).toBe("UTILITY");
    expect(body.text).toBe("Hi {{1}}, your {{2}} at {{3}} is complete. Tap below to rate your visit.");
    expect(button.text).toBe("Rate your visit");
    expect(button.url).toBe("https://x.test/my-glow?review={{1}}");
    expect(button.example.url_suffix_example).toBe("https://x.test/my-glow?review=00000000-0000-0000-0000-000000000000");
  });

  it("keeps the appointment button for existing kinds", () => {
    for (const kind of ["reminder", "rescheduled", "cancelled", "no_show"] as const) {
      const { button } = parts(kind);
      expect(button.text).toBe("View appointment");
      expect(button.url).toBe("https://x.test/my-glow/appointments/{{1}}");
    }
  });
});
