import { describe, expect, it } from "vitest";
import { rewardAccessError } from "./clientRewardAccess";

describe("rewardAccessError", () => {
  it("is null when saved", () => {
    expect(rewardAccessError(null)).toBeNull();
  });

  it("explains a missing migration", () => {
    expect(rewardAccessError({ code: "PGRST202", message: "Could not find the function public.set_client_review_rewards" })).toBe(
      "This needs migration 087 in Supabase first."
    );
  });

  it("explains forbidden and invalid", () => {
    expect(rewardAccessError({ message: "REVIEW_FORBIDDEN" })).toBe("Only admins can change this.");
    expect(rewardAccessError({ message: "REVIEW_INVALID" })).toBe("This client couldn't be found.");
    expect(rewardAccessError({ message: "boom" })).toBe("Couldn't save. Please try again.");
  });
});
