"use client";

import { useState } from "react";
import type { Cell, Report, ReportSection } from "@/lib/reports/model";
import { formatCell, generatedLabel } from "@/lib/reports/export";

const PREVIEW_ROWS = 50;

function dateLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Simple gold bar chart for a section (top 10 by value). */
function Bars({ section }: { section: ReportSection }) {
  const { labelKey, valueKey } = section.chart!;
  const col = section.columns.find((c) => c.key === valueKey);
  const rows = section.rows
    .map((r) => ({ label: String(r[labelKey] ?? ""), value: Number(r[valueKey] ?? 0) }))
    .filter((r) => r.value > 0)
    .slice(0, 10);
  if (rows.length < 2) return null;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="mb-4 space-y-1.5 rounded-xl bg-cream p-4">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-xs">
          <span className="w-36 shrink-0 truncate text-ink/70" title={r.label}>
            {r.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-skin">
            <div className="h-full rounded-full bg-coral" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right font-medium text-ink">{col ? formatCell(col, r.value as Cell) : r.value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionTable({ section }: { section: ReportSection }) {
  const [all, setAll] = useState(false);
  const rows = all ? section.rows : section.rows.slice(0, PREVIEW_ROWS);
  return (
    <section className="mt-6">
      <h3 className="text-base font-semibold text-coral-dark">{section.title}</h3>
      {section.note && <p className="text-xs text-ink/50">{section.note}</p>}
      <div className="mt-2">{section.chart && <Bars section={section} />}</div>
      <div className="overflow-x-auto rounded-xl border border-nude/70">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-skin text-[11px] font-semibold uppercase tracking-wide text-ink/70">
            <tr>
              {section.columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 ${c.kind && c.kind !== "text" ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-nude/50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={section.columns.length} className="px-3 py-6 text-center text-ink/50">
                  No data for this period.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="hover:bg-cream">
                  {section.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 ${c.kind && c.kind !== "text" ? "whitespace-nowrap text-right" : "text-ink/80"}`}>
                      {formatCell(c, row[c.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {section.rows.length > PREVIEW_ROWS && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-semibold text-coral-dark hover:underline">
          {all ? "Show fewer rows" : `Showing ${PREVIEW_ROWS} of ${section.rows.length} rows — show all (exports always include every row)`}
        </button>
      )}
    </section>
  );
}

export default function ReportPreview({ report }: { report: Report }) {
  return (
    <div>
      <div className="border-b-2 border-coral pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-coral-dark">Report Preview</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink">{report.title}</h2>
        <p className="text-sm text-ink/70">
          {dateLabel(report.period.from)} – {dateLabel(report.period.to)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {report.filtersUsed
            .filter(([k]) => k !== "Period")
            .map(([k, v]) => (
              <span key={k} className="rounded-full bg-skin px-3 py-1 text-ink/75">
                <span className="font-semibold">{k}:</span> {v}
              </span>
            ))}
          <span className="rounded-full bg-cream px-3 py-1 text-ink/55">Generated {generatedLabel(report)}</span>
        </div>
      </div>

      {report.summary.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.summary.map((s) => (
            <div key={s.label} className="rounded-xl border border-nude/70 bg-cream px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">{s.label}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {report.findings.length > 0 && (
        <div className="mt-4 rounded-xl bg-skin/60 p-4">
          <p className="text-sm font-semibold text-coral-dark">Key Findings</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink/80">
            {report.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {report.sections.map((s) => (
        <SectionTable key={s.title} section={s} />
      ))}
    </div>
  );
}
