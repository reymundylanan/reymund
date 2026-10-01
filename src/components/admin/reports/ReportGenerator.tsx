"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarX,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  Loader2,
  Plus,
  Receipt,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { loadReportData } from "@/lib/supabase/queries/reportData";
import { buildCustomReport, buildReport, CUSTOM_COLUMNS, type CustomSource } from "@/lib/reports/builders";
import { exportReport, type ExportFormat } from "@/lib/reports/export";
import { REPORT_CATALOG, type Report, type ReportData, type ReportFilters, type ReportType } from "@/lib/reports/model";
import ReportPreview from "@/components/admin/reports/ReportPreview";

type Kind = ReportType | "custom";
type Option = { id: string; name: string };
type RecentRun = { id: string; name: string; report_type: string; params: Saved; format: ExportFormat; created_at: string; by: { full_name: string | null } | { full_name: string | null }[] | null };
type Saved = { kind: Kind; filters: ReportFilters; source?: CustomSource; columns?: string[] };

const ICONS: Record<ReportType, typeof Star> = {
  sales: Wallet,
  appointments: CalendarCheck,
  staff: UserRound,
  client_spending: Receipt,
  client_activity: Users,
  services: Sparkles,
  branches: Building2,
  reviews: Star,
  payments: Wallet,
  cancellations: CalendarX,
  walkins: Users,
};

const APPT_STATUSES = [
  { value: "upcoming", label: "Upcoming" },
  { value: "in_service", label: "In Service" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];
const PAYMENT_STATUSES = [
  { value: "settled", label: "Paid / Verified" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Not Received" },
  { value: "refunded", label: "Refunded" },
];

const FORMATS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: "pdf", label: "PDF", icon: FileText },
  { format: "excel", label: "Excel", icon: FileSpreadsheet },
  { format: "csv", label: "CSV", icon: FileType },
  { format: "word", label: "Word", icon: FileText },
];

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function defaultFilters(): ReportFilters {
  const t = todayKey();
  return { from: `${t.slice(0, 7)}-01`, to: t, branchId: null, staffId: null, service: null, status: null, rating: null };
}

function one<T>(v: T | T[] | null): T | null {
  return !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;
}

const field = "rounded-xl border border-nude bg-white px-3 py-2 text-sm text-ink outline-none focus:border-coral";

export default function ReportGenerator() {
  const [filters, setFilters] = useState<ReportFilters>(defaultFilters);
  const [kind, setKind] = useState<Kind>("sales");
  const [customSource, setCustomSource] = useState<CustomSource>("appointments");
  const [customCols, setCustomCols] = useState<string[]>(CUSTOM_COLUMNS.appointments.map((c) => c.key));
  const [branches, setBranches] = useState<Option[]>([]);
  const [staff, setStaff] = useState<Option[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [recentReady, setRecentReady] = useState<boolean | null>(null);
  const cache = useRef<{ key: string; data: ReportData } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const meta = kind === "custom" ? null : REPORT_CATALOG.find((r) => r.type === kind)!;
  const applies = (f: string) =>
    kind === "custom" ? ["branch", "staff", "service", customSource === "reviews" ? "rating" : "status"].includes(f) : meta!.filters.includes(f as never);
  const statusOptions = kind === "payments" || (kind === "custom" && customSource === "payments") ? PAYMENT_STATUSES : APPT_STATUSES;

  const loadRecent = useCallback(async () => {
    const { data, error: err } = await createClient()
      .from("report_runs")
      .select("id, name, report_type, params, format, created_at, by:profiles!report_runs_generated_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(15);
    if (err) {
      if (!isNotMigratedError(err)) logQueryError("report_runs", err);
      setRecentReady(false);
      return;
    }
    setRecent((data ?? []) as unknown as RecentRun[]);
    setRecentReady(true);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    Promise.all([
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("staff_members").select("id, full_name").order("full_name"),
      supabase.from("branch_services").select("name").order("name"),
    ]).then(([b, s, sv]) => {
      if (cancelled) return;
      setBranches((b.data ?? []) as Option[]);
      setStaff(((s.data ?? []) as { id: string; full_name: string }[]).map((x) => ({ id: x.id, name: x.full_name })));
      setServices([...new Set(((sv.data ?? []) as { name: string }[]).map((x) => x.name.trim()))]);
    });
    const first = setTimeout(loadRecent, 0);
    return () => {
      cancelled = true;
      clearTimeout(first);
    };
  }, [loadRecent]);

  function update(patch: Partial<ReportFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function chooseKind(next: Kind) {
    setKind(next);
    // Status values differ between reports; don't carry an invalid one over.
    update({ status: null, rating: next === "reviews" ? filters.rating : null });
  }

  async function getData(from: string, to: string) {
    const key = `${from}|${to}`;
    if (cache.current?.key === key) return cache.current.data;
    const data = await loadReportData(createClient(), from, to);
    cache.current = { key, data };
    return data;
  }

  async function generate(saved?: Saved, fresh = false): Promise<Report | null> {
    const k = saved?.kind ?? kind;
    const f = saved?.filters ?? filters;
    const src = saved?.source ?? customSource;
    const cols = saved?.columns ?? customCols;
    setError(null);
    setNotice(null);
    if (!f.from || !f.to || f.from > f.to) {
      setError("Choose a valid date range (From must be on or before To).");
      return null;
    }
    setLoading(true);
    try {
      if (fresh) cache.current = null;
      const data = await getData(f.from, f.to);
      const built = k === "custom" ? buildCustomReport(src, cols, data, f) : buildReport(k, data, f);
      setReport(built);
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      return built;
    } catch (e) {
      console.error("report generation failed:", e);
      setError(e instanceof Error ? e.message : "Couldn't generate the report.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function doExport(r: Report, format: ExportFormat, saved: Saved, log = true) {
    if (!exportReport(r, format)) {
      setError("Your browser blocked the PDF window. Allow pop-ups for this site and try again.");
      return;
    }
    if (!log) return;
    const { error: err } = await createClient()
      .from("report_runs")
      .insert({ name: r.title, report_type: saved.kind, params: saved, format });
    if (err && !isNotMigratedError(err)) logQueryError("report_runs insert", err);
    loadRecent();
  }

  const currentSaved = (): Saved => ({ kind, filters, source: customSource, columns: customCols });

  async function summarizeFeedback() {
    if (!report) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/admin/reviews/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Using only reviews dated ${report.period.from} to ${report.period.to}, list the most common positive feedback and the most common complaints, with how many reviews mention each. Be brief.`,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.answer) throw new Error(data?.error ?? "The AI summary isn't available right now.");
      const lines = String(data.answer)
        .split("\n")
        .map((l: string) => l.replace(/^#+\s*/, "").replace(/^[-*•]\s*/, "").replace(/\*\*/g, "").trim())
        .filter(Boolean);
      setReport((r) =>
        r
          ? {
              ...r,
              findings: [...r.findings.filter((x) => !x.startsWith("Common client feedback")), `Common client feedback (AI summary of the review comments): ${lines.join(" · ")}`],
            }
          : r
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "The AI summary isn't available right now.");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-skin text-coral-dark">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-ink">Reports &amp; Analytics</h1>
              <p className="text-sm text-ink/60">Generate detailed reports for sales, appointments, clients, staff, services, branches, and reviews.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
            Date From
            <input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} className={`mt-1 block ${field}`} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
            Date To
            <input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} className={`mt-1 block ${field}`} />
          </label>
          {applies("branch") && (
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              Branch
              <select value={filters.branchId ?? ""} onChange={(e) => update({ branchId: e.target.value || null })} className={`mt-1 block ${field}`}>
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {applies("staff") && (
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              Staff
              <select value={filters.staffId ?? ""} onChange={(e) => update({ staffId: e.target.value || null })} className={`mt-1 block ${field}`}>
                <option value="">All Staff</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {applies("service") && (
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              Service
              <select value={filters.service ?? ""} onChange={(e) => update({ service: e.target.value || null })} className={`mt-1 block max-w-56 ${field}`}>
                <option value="">All Services</option>
                {services.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          {applies("status") && (
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              Status
              <select value={filters.status ?? ""} onChange={(e) => update({ status: e.target.value || null })} className={`mt-1 block ${field}`}>
                <option value="">All Statuses</option>
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {applies("rating") && (
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              Rating
              <select value={filters.rating ?? ""} onChange={(e) => update({ rating: e.target.value ? Number(e.target.value) : null })} className={`mt-1 block ${field}`}>
                <option value="">All Ratings</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => setFilters(defaultFilters())}
            className="flex items-center gap-1.5 rounded-xl border border-nude px-3 py-2 text-sm font-medium text-ink/70 hover:border-coral"
          >
            <RotateCcw className="h-4 w-4" /> Clear Filters
          </button>
        </div>
      </div>

      {/* Report type */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-coral-dark">Select Report</h2>
          <button
            type="button"
            onClick={() => chooseKind("custom")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
              kind === "custom" ? "bg-coral text-white" : "border border-coral text-coral-dark hover:bg-skin"
            }`}
          >
            <Plus className="h-4 w-4" /> Create Custom Report
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {REPORT_CATALOG.map((r) => {
            const Icon = ICONS[r.type];
            const active = kind === r.type;
            return (
              <button
                key={r.type}
                type="button"
                onClick={() => chooseKind(r.type)}
                aria-pressed={active}
                className={`flex gap-3 rounded-2xl border p-4 text-left transition ${
                  active ? "border-coral bg-skin shadow-sm ring-1 ring-coral" : "border-nude/80 bg-white hover:border-coral/60 hover:bg-cream"
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-coral text-white" : "bg-skin text-coral-dark"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {r.title}
                    {r.featured && <span className="rounded-full bg-champagne/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-coral-dark">Key</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink/60">{r.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        {kind === "custom" && (
          <div className="mt-5 rounded-2xl border border-coral/40 bg-cream p-5">
            <p className="text-sm font-semibold text-ink">Custom Report — choose the data and columns</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["appointments", "payments", "reviews"] as CustomSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setCustomSource(s);
                    setCustomCols(CUSTOM_COLUMNS[s].map((c) => c.key));
                    update({ status: null });
                  }}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${customSource === s ? "bg-coral text-white" : "border border-nude bg-white text-ink/70"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink/60">Columns to include</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {CUSTOM_COLUMNS[customSource].map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-ink/80">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-coral"
                    checked={customCols.includes(c.key)}
                    onChange={(e) => setCustomCols((cols) => (e.target.checked ? [...cols, c.key] : cols.filter((k) => k !== c.key)))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => generate(undefined, true)}
            disabled={loading || (kind === "custom" && customCols.length === 0)}
            className="flex items-center gap-2 rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            {loading ? "Generating…" : "Generate Report"}
          </button>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Preview + export */}
      {report && (
        <div ref={previewRef} className="scroll-mt-6 rounded-2xl border border-nude/70 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Download className="h-4 w-4 text-coral-dark" /> Export Report
            </p>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.format}
                    type="button"
                    onClick={() => doExport(report, f.format, currentSaved())}
                    className="flex items-center gap-1.5 rounded-full border border-coral/50 bg-white px-4 py-1.5 text-sm font-semibold text-coral-dark hover:bg-skin"
                  >
                    <Icon className="h-4 w-4" /> {f.label}
                  </button>
                );
              })}
              {report.type === "reviews" && (
                <button
                  type="button"
                  onClick={summarizeFeedback}
                  disabled={aiBusy}
                  className="flex items-center gap-1.5 rounded-full bg-coral px-4 py-1.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                >
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Common Client Feedback (AI)
                </button>
              )}
            </div>
          </div>
          {notice && <p className="mb-3 text-sm text-amber-700">{notice}</p>}
          <ReportPreview report={report} />
          <p className="mt-6 text-xs text-ink/50">
            PDF opens a print-ready page — choose &ldquo;Save as PDF&rdquo; in the print window. Excel downloads a workbook with a Summary sheet and a sheet per table.
          </p>
        </div>
      )}

      {/* Recent reports */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-coral-dark">Recent Reports</h2>
        {recentReady === false ? (
          <p className="mt-3 text-sm text-ink/55">Apply migration 064 to keep a list of exported reports here.</p>
        ) : recent.length === 0 ? (
          <p className="mt-3 text-sm text-ink/55">Reports you export will appear here.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">
                <tr>
                  <th className="py-2">Report</th>
                  <th className="py-2">Date Range</th>
                  <th className="py-2">Format</th>
                  <th className="py-2">Generated By</th>
                  <th className="py-2">Generated</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nude/50">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 font-medium text-ink">{r.name}</td>
                    <td className="py-2.5 text-ink/70">
                      {r.params?.filters?.from} – {r.params?.filters?.to}
                    </td>
                    <td className="py-2.5 uppercase text-ink/70">{r.format}</td>
                    <td className="py-2.5 text-ink/70">{one(r.by)?.full_name ?? "—"}</td>
                    <td className="py-2.5 text-ink/60">{new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-3 text-xs font-semibold">
                        <button
                          type="button"
                          className="text-coral-dark hover:underline"
                          onClick={() => {
                            setKind(r.params.kind);
                            setFilters(r.params.filters);
                            if (r.params.source) setCustomSource(r.params.source);
                            if (r.params.columns) setCustomCols(r.params.columns);
                            generate(r.params, true);
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="text-coral-dark hover:underline"
                          onClick={async () => {
                            const built = await generate(r.params, true);
                            if (built) doExport(built, r.format, r.params, false);
                          }}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${r.name}`}
                          className="text-red-600 hover:underline"
                          onClick={async () => {
                            setRecent((list) => list.filter((x) => x.id !== r.id));
                            const { error: err } = await createClient().from("report_runs").delete().eq("id", r.id);
                            if (err) {
                              logQueryError("report_runs delete", err);
                              loadRecent();
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink/50">View and Download regenerate the report from current data with the same settings.</p>
          </div>
        )}
      </div>
    </div>
  );
}
