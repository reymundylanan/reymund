import { describe, expect, it } from "vitest";
import { toStaffReviewItems, type RawStaffReviewRow } from "./staffReviews";

const row = (over: Partial<RawStaffReviewRow> = {}): RawStaffReviewRow => ({
  id: "r1",
  rating: 5,
  text: "Great",
  status: "visible",
  created_at: "2026-09-30T02:00:00Z",
  edited_at: null,
  client: { full_name: "Maria Clara Santos" },
  service: { name: "Facial" },
  appointment: {
    scheduled_date: "2026-09-29",
    booked: [
      { service_name: "Eyebrow", position: 1 },
      { service_name: "Deep Tissue Massage", position: 0 },
    ],
  },
  ...over,
});

describe("toStaffReviewItems", () => {
  it("maps reviewer, booked services in order and the visit date", () => {
    expect(toStaffReviewItems([row()], false)).toEqual([
      {
        id: "r1",
        rating: 5,
        text: "Great",
        status: "visible",
        createdAt: "2026-09-30T02:00:00Z",
        editedAt: null,
        reviewer: "Maria C.",
        serviceName: "Deep Tissue Massage, Eyebrow",
        serviceDate: "2026-09-29",
      },
    ]);
  });

  it("falls back to the service row, then nothing", () => {
    const [a] = toStaffReviewItems([row({ appointment: { scheduled_date: "2026-09-29" } })], false);
    expect(a.serviceName).toBe("Facial");
    const [b] = toStaffReviewItems([row({ appointment: null, service: null, client: null })], false);
    expect(b).toMatchObject({ serviceName: null, serviceDate: null, reviewer: "Client" });
  });

  it("keeps only public reviews unless hidden ones are requested", () => {
    const rows = [row({ id: "v" }), row({ id: "f", status: "flagged" }), row({ id: "h", status: "hidden" }), row({ id: "x", status: "removed" })];
    expect(toStaffReviewItems(rows, false).map((r) => r.id)).toEqual(["v", "f"]);
    expect(toStaffReviewItems(rows, true).map((r) => r.id)).toEqual(["v", "f", "h", "x"]);
  });

  it("accepts embeds returned as arrays", () => {
    const [a] = toStaffReviewItems(
      [row({ client: [{ full_name: "Jo Reyes" }], appointment: [{ scheduled_date: "2026-09-01", booked: [] }] })],
      false
    );
    expect(a).toMatchObject({ reviewer: "Jo R.", serviceName: "Facial", serviceDate: "2026-09-01" });
  });
});
