import { describe, expect, it } from "vitest";
import { bookedServiceId, parseNotesServiceNames, toAppointmentServiceRows } from "./bookedServices";

const ID = "3f0c2a52-9d1e-4a8b-9d7f-0b1c2d3e4f50";

describe("bookedServiceId", () => {
  it("keeps a plain uuid", () => expect(bookedServiceId(ID)).toBe(ID));
  it("strips a hair-size suffix", () => expect(bookedServiceId(`${ID}·short`)).toBe(ID));
  it("drops package / missing ids", () => {
    expect(bookedServiceId("pkg-gold")).toBeNull();
    expect(bookedServiceId(undefined)).toBeNull();
  });
});

describe("parseNotesServiceNames", () => {
  it("splits the booking notes like the SQL backfill", () => {
    expect(parseNotesServiceNames("Facial, Eyebrow with Maria — ₱1,150.00")).toEqual(["Facial", "Eyebrow"]);
    expect(parseNotesServiceNames("Deep Tissue Massage with Any Professional — ₱1,500.00")).toEqual(["Deep Tissue Massage"]);
  });
  it("handles empty notes", () => {
    expect(parseNotesServiceNames(null)).toEqual([]);
    expect(parseNotesServiceNames("  ")).toEqual([]);
  });
});

it("builds ordered rows", () => {
  expect(toAppointmentServiceRows("a1", [{ id: ID, name: "Facial " }, { id: "pkg", name: "Gold Spa Package" }])).toEqual([
    { appointment_id: "a1", position: 0, service_id: ID, service_name: "Facial" },
    { appointment_id: "a1", position: 1, service_id: null, service_name: "Gold Spa Package" },
  ]);
});
