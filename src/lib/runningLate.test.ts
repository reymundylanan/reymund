import { describe, expect, it } from "vitest";
import { findRunningLate, manilaMinutes, runningLateMessage, type LateVisit } from "./runningLate";

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
// 1:00 PM Manila = 05:00 UTC.
const started = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 8, h - 8, m)).toISOString();
};
const v = (over: Partial<LateVisit>): LateVisit => ({
  id: "x",
  professionalId: "sweet",
  professionalName: "Ms. Sweet",
  clientId: "c",
  clientName: "Client",
  startTime: "13:00:00",
  durationMinutes: 60,
  status: "confirmed",
  sessionStatus: null,
  serviceStartedAt: null,
  visitType: "appointment",
  ...over,
});

describe("running late", () => {
  it("reads service start times in Manila time", () => {
    expect(manilaMinutes(started("13:05"))).toBe(at("13:05"));
  });

  it("works out the knock-on delay for the next clients", () => {
    const visits = [
      v({ id: "ana", clientName: "Ana", sessionStatus: "in_service", serviceStartedAt: started("13:00") }),
      v({ id: "maria", clientName: "Maria", startTime: "14:00:00" }),
      v({ id: "joy", clientName: "Joy", startTime: "15:00:00" }),
      v({ id: "lea", clientName: "Lea", startTime: "17:00:00" }),
    ];
    const [late] = findRunningLate(visits, at("14:16"));
    expect(late.current).toMatchObject({ id: "ana", overBy: 16 });
    // Maria 2:00 → ~2:16, Joy 3:00 → ~3:16; Lea at 5:00 isn't affected (a gap absorbs it).
    expect(late.next.map((d) => [d.clientName, d.delay])).toEqual([
      ["Maria", 16],
      ["Joy", 16],
    ]);
  });

  it("lets the buffer absorb a small overrun", () => {
    const visits = [
      v({ id: "ana", sessionStatus: "in_service", serviceStartedAt: started("13:00") }),
      v({ id: "maria", startTime: "14:10:00" }), // booked with a 10-minute buffer
    ];
    const [late] = findRunningLate(visits, at("14:12"));
    expect(late.current.overBy).toBe(12);
    expect(late.next).toEqual([]); // only 2 minutes — not worth telling
  });

  it("uses the real start when the service started late", () => {
    const visits = [v({ id: "ana", sessionStatus: "in_service", serviceStartedAt: started("13:20") }), v({ id: "maria", startTime: "14:00:00" })];
    expect(findRunningLate(visits, at("14:10"))).toEqual([]); // planned end is 2:20
    const [late] = findRunningLate(visits, at("14:30"));
    expect(late.current.overBy).toBe(10);
    expect(late.next[0].delay).toBe(30);
  });

  it("ignores other therapists, finished and cancelled visits", () => {
    const visits = [
      v({ id: "ana", sessionStatus: "in_service", serviceStartedAt: started("13:00") }),
      v({ id: "other", professionalId: "bea", startTime: "14:00:00" }),
      v({ id: "done", startTime: "14:00:00", sessionStatus: "completed" }),
      v({ id: "gone", startTime: "14:00:00", status: "cancelled" }),
    ];
    expect(findRunningLate(visits, at("14:20"))[0].next).toEqual([]);
  });

  it("tells the client the time and a rounded delay", () => {
    expect(runningLateMessage({ start: at("14:00"), delay: 16 }, "One Cecilia Center")).toBe(
      "Your 2:00 PM appointment at One Cecilia Center may start about 15 minutes late — your therapist is finishing with another client. Thank you for your patience; there's no need to rush."
    );
  });
});
