// AI Report Assistant (Admin → Reports): answers questions like "Which
// service has the most clients?" from the same numbers the reports show.
// Each report is built with the current filters, then shrunk to its
// summary, findings and top rows so the AI reads facts, not raw records.
import { buildReport } from "@/lib/reports/builders";
import { formatCell } from "@/lib/reports/export";
import { REPORT_CATALOG, type ReportData, type ReportFilters, type ReportType } from "@/lib/reports/model";

export const ROWS_PER_SECTION = 12;

export type ReportFact = {
  type: ReportType;
  title: string;
  summary: Record<string, string>;
  findings: string[];
  sections: { title: string; rows: Record<string, string>[]; totalRows: number }[];
};

/** Every report in the catalog, as compact facts for the AI. */
export function buildReportFacts(data: ReportData, filters: ReportFilters, now = new Date()): ReportFact[] {
  return REPORT_CATALOG.map(({ type }) => {
    const r = buildReport(type, data, filters, now);
    return {
      type,
      title: r.title,
      summary: Object.fromEntries(r.summary.map((s) => [s.label, s.value])),
      findings: r.findings.slice(0, 6),
      sections: r.sections.map((s) => ({
        title: s.title,
        totalRows: s.rows.length,
        rows: s.rows.slice(0, ROWS_PER_SECTION).map((row) => Object.fromEntries(s.columns.map((c) => [c.label, formatCell(c, row[c.key])]))),
      })),
    };
  });
}

export const REPORT_ASSISTANT_SYSTEM = `You are the AI Report Assistant for Blush Spa & Aesthetics (GlowSync), helping the
Admin understand bookings, sales, services, staff, clients, branches, payments, cancellations, walk-ins and
reviews. Answer ONLY from the FACTS provided — they are the same numbers as the Admin's reports for the
selected period and filters. Never invent numbers, names or trends. If the facts don't contain the answer, say
so and suggest which report or filter would show it. "Most clients"/"most popular" means the highest bookings or
unique clients; "best selling" means the highest revenue — say which measure you used. Use ₱ for money.
Format: a one-line direct answer first, then up to 5 short "- " bullets with the key numbers, optional "### "
headings, and **bold** for names. Be concise. In "reports", list 0-2 report types (from the FACTS "type" values)
that show more detail.`;

export const REPORT_ASSISTANT_SCHEMA = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    reports: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["answer"],
};

const TYPES = new Set<string>(REPORT_CATALOG.map((r) => r.type));

export function isReportType(v: unknown): v is ReportType {
  return typeof v === "string" && TYPES.has(v);
}

/** YYYY-MM-DD dates, from ≤ to, and at most a year apart. */
export function validPeriod(from: unknown, to: unknown): { from: string; to: string } | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof from !== "string" || typeof to !== "string" || !re.test(from) || !re.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b || b - a > 366 * 86_400_000) return null;
  return { from, to };
}
