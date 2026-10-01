import { describe, expect, it } from "vitest";
import { buildCustomReport, buildReport } from "./builders";
import { formatCell, toCsv, toExcelXml, toPrintHtml } from "./export";
import type { RawAppointment, RawPayment, RawReview, ReportData, ReportFilters } from "./model";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

function appt(o: Partial<RawAppointment>): RawAppointment {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-09-28",
    time: "10:00:00",
    status: "confirmed",
    sessionStatus: null,
    visitType: "appointment",
    clientId: "c1",
    clientName: "Ana",
    walkinPhone: null,
    branchId: A,
    branchName: "One Cecilia Center",
    staffId: "s1",
    staffName: "Ms. Mary",
    services: ["Facial"],
    durationMinutes: 60,
    price: 1000,
    arrivalTime: null,
    serviceStartedAt: null,
    completedAt: null,
    rescheduleCount: 0,
    ...o,
  };
}

function pay(o: Partial<RawPayment>): RawPayment {
  return {
    id: Math.random().toString(36).slice(2),
    amount: 1000,
    method: "cash",
    status: "settled",
    paymentType: null,
    createdAt: "2026-09-28T03:00:00Z",
    date: "2026-09-28",
    verifiedAt: null,
    referenceNo: null,
    appointmentId: "a1",
    clientId: "c1",
    clientName: "Ana",
    branchId: A,
    branchName: "One Cecilia Center",
    staffId: "s1",
    staffName: "Ms. Mary",
    services: ["Facial"],
    visitType: "appointment",
    ...o,
  };
}

function review(o: Partial<RawReview>): RawReview {
  return { id: Math.random().toString(36).slice(2), type: "staff", rating: 5, text: "Great", status: "visible", date: "2026-09-28", target: "Ms. Mary", clientName: "Ana", staffId: "s1", branchId: A, serviceName: null, photos: 0, ...o };
}

const data: ReportData = {
  appointments: [
    appt({ sessionStatus: "completed", serviceStartedAt: "2026-09-28T02:00:00Z", completedAt: "2026-09-28T02:50:00Z" }),
    appt({ status: "cancelled" }),
    appt({ sessionStatus: "no_show", clientId: "c2", clientName: "Ben", services: ["Massage"], staffId: "s2", staffName: "Ms. Gema" }),
    appt({ visitType: "walk_in", clientId: null, clientName: "Walk", sessionStatus: "paid", branchId: B, branchName: "Robinsons" }),
    appt({ date: "2026-10-05" }),
  ],
  payments: [
    pay({}),
    pay({ amount: 500, method: "gcash", paymentType: "pay_now", appointmentId: "a2" }),
    pay({ amount: 300, status: "pending", appointmentId: "a3" }),
    pay({ amount: 800, clientId: null, clientName: "Walk", branchId: B, branchName: "Robinsons", appointmentId: "a4", visitType: "walk_in" }),
  ],
  reviews: [review({}), review({ rating: 2 }), review({ type: "service", target: "Facial", serviceName: "Facial", staffId: null, rating: 4, photos: 1 }), review({ status: "removed", rating: 1 })],
  returningClientIds: new Set(["c1"]),
  staff: [
    { id: "s1", name: "Ms. Mary", department: "Clinic", branchId: A },
    { id: "s2", name: "Ms. Gema", department: "Hair", branchId: A },
  ],
  branches: [
    { id: A, name: "One Cecilia Center" },
    { id: B, name: "Robinsons" },
  ],
};

const f: ReportFilters = { from: "2026-09-25", to: "2026-10-01", branchId: null, staffId: null, service: null, status: null, rating: null };
const val = (r: ReturnType<typeof buildReport>, label: string) => r.summary.find((s) => s.label === label)?.value;

describe("report builders", () => {
  it("sales uses verified payments in the period only", () => {
    const r = buildReport("sales", data, f, new Date("2026-10-01T00:00:00Z"));
    expect(val(r, "Total Revenue")).toBe("₱2,300.00");
    expect(val(r, "Paid Transactions")).toBe("3");
    expect(val(r, "Pending Payments")).toBe("1 · ₱300.00");
    expect(val(r, "Advance (Pay Now)")).toBe("₱500.00");
    expect(r.filtersUsed[0]).toEqual(["Period", "Sep 25, 2026 – Oct 1, 2026"]);
  });

  it("appointments exclude walk-ins and out-of-period rows", () => {
    const r = buildReport("appointments", data, f);
    expect(val(r, "Total Appointments")).toBe("3");
    expect(val(r, "Completed")).toBe("1");
    expect(val(r, "Cancelled")).toBe("1");
    expect(val(r, "No-Shows")).toBe("1");
  });

  it("staff performance ranks on real metrics", () => {
    const r = buildReport("staff", data, f);
    const table = r.sections[1].rows;
    const mary = table.find((x) => x.staff === "Ms. Mary")!;
    expect(mary).toMatchObject({ appointments: 3, completed: 2, cancelled: 1, sales: 2300, reviews: 2, rating: 3.5, avgMinutes: 50 });
    expect(r.sections[0].rows[0]).toMatchObject({ rank: 1, staff: "Ms. Mary" });
  });

  it("client spending groups accounts and walk-ins", () => {
    const r = buildReport("client_spending", data, f);
    expect(r.sections[1].rows.map((x) => [x.client, x.total])).toEqual([
      ["Ana", 1500],
      ["Walk (walk-in)", 800],
    ]);
  });

  it("client activity splits new, returning and guests", () => {
    const r = buildReport("client_activity", data, f);
    expect(val(r, "Returning Clients")).toBe("1");
    expect(val(r, "New Clients")).toBe("1");
    expect(val(r, "Walk-in Guests")).toBe("1");
  });

  it("reviews count statuses but leave removed out of ratings", () => {
    const r = buildReport("reviews", data, f);
    expect(val(r, "Total Reviews")).toBe("3");
    expect(val(r, "Average Rating")).toBe("3.7 ★");
    expect(val(r, "Removed")).toBe("1");
    expect(val(r, "With Photos")).toBe("1");
  });

  it("branch, cancellation and walk-in reports", () => {
    const b = buildReport("branches", data, f).sections[0].rows;
    expect(b.find((x) => x.branch === "Robinsons")).toMatchObject({ walkins: 1, revenue: 800 });
    const c = buildReport("cancellations", data, f);
    expect(val(c, "Cancellations")).toBe("1");
    expect(val(c, "No-Shows")).toBe("1");
    expect(val(buildReport("walkins", data, f), "Total Walk-Ins")).toBe("1");
  });

  it("filters by branch and staff", () => {
    const r = buildReport("sales", data, { ...f, branchId: B });
    expect(val(r, "Total Revenue")).toBe("₱800.00");
    expect(r.filtersUsed).toContainEqual(["Branch", "Robinsons"]);
  });

  it("custom report keeps only chosen columns", () => {
    const r = buildCustomReport("payments", ["client", "amount"], data, f);
    expect(r.sections[0].columns.map((c) => c.key)).toEqual(["client", "amount"]);
    expect(r.sections[0].rows).toHaveLength(4);
    expect(r.summary).toContainEqual({ label: "Total Amount", value: "₱2,600.00" });
  });
});

describe("exports", () => {
  const r = buildReport("sales", data, f, new Date("2026-10-01T00:00:00Z"));

  it("formats cells", () => {
    expect(formatCell({ key: "x", label: "x", kind: "money" }, 1500)).toBe("₱1,500.00");
    expect(formatCell({ key: "x", label: "x", kind: "percent" }, 12.5)).toBe("12.5%");
    expect(formatCell({ key: "x", label: "x" }, undefined)).toBe("—");
  });

  it("writes CSV with escaped cells", () => {
    const csv = toCsv(r);
    expect(csv.startsWith("﻿Sales & Financial Report")).toBe(true);
    expect(csv).toContain('Pending Payments,1 · ₱300.00');
    expect(csv).toContain("Date,Transactions,Revenue");
  });

  it("writes an Excel workbook with a sheet per section", () => {
    const xml = toExcelXml(r);
    expect(xml).toContain('<Worksheet ss:Name="Summary">');
    expect(xml).toContain('<Worksheet ss:Name="Daily Sales">');
    expect((xml.match(/<Worksheet /g) ?? []).length).toBe(1 + r.sections.length);
  });

  it("escapes HTML in the printable report", () => {
    const html = toPrintHtml({ ...r, title: "<b>x</b>" }, null);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("Blush Spa &amp; Aesthetics");
  });
});
