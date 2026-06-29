"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { reportTemplates } from "@/lib/adminData";

export default function ReportBuilder() {
  const [templateId, setTemplateId] = useState(reportTemplates[0].id);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [anonymizePII, setAnonymizePII] = useState(false);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Report Engine</h2>
      <p className="text-sm text-ink/50">
        Select a template and configure parameters to export data.
      </p>

      <p className="mt-5 text-xs font-semibold uppercase text-ink/40">
        1. Select Report Template
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {reportTemplates.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplateId(t.id)}
            className={`rounded-xl border p-4 text-left ${
              templateId === t.id ? "border-coral bg-blush" : "border-ink/10"
            }`}
          >
            <p className="font-medium text-ink">{t.label}</p>
            <p className="mt-1 text-xs text-ink/50">{t.description}</p>
          </button>
        ))}
      </div>

      <p className="mt-6 text-xs font-semibold uppercase text-ink/40">
        2. Configure Parameters
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-ink/50">Date Range</label>
          <input
            defaultValue="Oct 01, 2023 - Oct 31, 2023"
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink/50">Specific Branch</label>
          <select className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral">
            <option>All Branches (Global)</option>
            <option>GlowSync BGC Flagship</option>
            <option>GlowSync Makati Central</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink/70">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeCharts}
            onChange={() => setIncludeCharts((v) => !v)}
            className="rounded border-ink/20"
          />
          Include visual charts
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={anonymizePII}
            onChange={() => setAnonymizePII((v) => !v)}
            className="rounded border-ink/20"
          />
          Anonymize customer PII
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
        <p className="text-xs text-ink/40">Estimated file size: ~4.2 MB (CSV)</p>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <FileDown className="h-4 w-4" /> PDF
          </button>
          <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button className="rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
            Generate CSV
          </button>
        </div>
      </div>
    </div>
  );
}
