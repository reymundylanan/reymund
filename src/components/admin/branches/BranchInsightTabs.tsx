"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Clock, Loader2, Star, UserCheck, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { loadReportData } from "@/lib/supabase/queries/reportData";
import { apptState, buildReport, peso } from "@/lib/reports/builders";
import type { ReportData, ReportFilters, ReportSection } from "@/lib/reports/model";
import { formatCell } from "@/lib/reports/export";

const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

function useBranchData(from: string, to: string) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadReportData(createClient(), from, to)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load data."));
    return () => {
      cancelled = true;
    };
  }, [from, to]);
  return { data, error };
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-nude/70 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ icon: I, label, value, note }: { icon: typeof Star; label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-nude/70 bg-cream p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/55">
        <I className="h-4 w-4 text-coral-dark" /> {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold text-ink">{value}</p>
      {note && <p className="mt-0.5 text-xs text-ink/55">{note}</p>}
    </div>
  );
}

function Loading({ error }: { error: string | null }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-10 text-sm text-ink/55 shadow-sm">
      {error ? <span className="text-red-600">{error}</span> : <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>}
    </div>
  );
}

function Bars({ rows, money = false }: { rows: { label: string; value: number }[]; money?: boolean }) {
  const shown = rows.filter((r) => r.value > 0).slice(0, 10);
  if (!shown.length) return <p className="rounded-xl bg-cream py-6 text-center text-sm text-ink/50">No data for this period.</p>;
  const max = Math.max(...shown.map((r) => r.value));
  return (
    <div className="space-y-2">
      {shown.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-ink/75" title={r.label}>
            {r.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-skin">
            <div className="h-full rounded-full bg-coral" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right font-medium text-ink">{money ? peso(r.value) : r.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function SectionTable({ section }: { section: ReportSection }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-nude/70">
      <table className="w-full min-w-[520px] text-left text-sm">
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
          {section.rows.length === 0 ? (
            <tr>
              <td colSpan={section.columns.length} className="px-3 py-6 text-center text-ink/50">
                No data for this period.
              </td>
            </tr>
          ) : (
            section.rows.slice(0, 15).map((row, i) => (
              <tr key={i}>
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
  );
}

// ── Header stat: real "Today's Appointments" ─────────────────────────────

export function BranchTodayStat({ branchId }: { branchId: string | null }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    createClient()
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .eq("scheduled_date", todayKey())
      .neq("status", "cancelled")
      .then(({ count: c, error }) => {
        logQueryError("BranchTodayStat", error);
        if (!cancelled) setCount(c ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);
  return (
    <div className="rounded-xl border border-ink/8 p-4">
      <p className="text-sm font-medium text-ink/50">Today&apos;s Appointments</p>
      <p className="mt-1.5 text-2xl font-bold text-ink">{count ?? "—"}</p>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────

export function BranchOverviewTab({ branchId, branchName }: { branchId: string; branchName: string }) {
  const today = todayKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const { data, error } = useBranchData(monthStart, today);
  const [onDuty, setOnDuty] = useState<{ name: string; status: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("staff_attendance")
      .select("status, time_in, time_out, staff:staff_members(full_name)")
      .eq("branch_id", branchId)
      .eq("attendance_date", today)
      .then(({ data: rows, error: err }) => {
        logQueryError("BranchOverview attendance", err);
        if (cancelled) return;
        type Row = { status: string; time_in: string | null; time_out: string | null; staff: { full_name: string } | { full_name: string }[] | null };
        setOnDuty(
          ((rows ?? []) as Row[])
            .filter((r) => r.time_in && !r.time_out && r.status !== "out")
            .map((r) => ({ name: (Array.isArray(r.staff) ? r.staff[0]?.full_name : r.staff?.full_name) ?? "Staff", status: r.status }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, today]);

  const view = useMemo(() => {
    if (!data) return null;
    const mine = data.appointments.filter((a) => a.branchId === branchId);
    const todays = mine.filter((a) => a.date === today);
    const paid = data.payments.filter((p) => p.branchId === branchId && p.status === "settled");
    const reviews = data.reviews.filter((r) => r.branchId === branchId && r.status !== "removed");
    const upcoming = todays
      .filter((a) => ["upcoming", "in_service"].includes(apptState(a)))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(0, 6);
    return {
      bookingsToday: todays.filter((a) => a.visitType === "appointment" && apptState(a) !== "cancelled").length,
      walkinsToday: todays.filter((a) => a.visitType === "walk_in" && apptState(a) !== "cancelled").length,
      completedToday: todays.filter((a) => apptState(a) === "completed").length,
      inService: todays.filter((a) => apptState(a) === "in_service").length,
      revenueToday: paid.filter((p) => p.date === today).reduce((s, p) => s + p.amount, 0),
      revenueMonth: paid.reduce((s, p) => s + p.amount, 0),
      monthBookings: mine.filter((a) => apptState(a) !== "cancelled").length,
      rating: reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null,
      reviewCount: reviews.length,
      upcoming,
    };
  }, [data, branchId, today]);

  if (!view) return <Loading error={error} />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={CalendarCheck} label="Bookings Today" value={String(view.bookingsToday)} note={`${view.completedToday} completed · ${view.inService} in service`} />
        <Stat icon={Users} label="Walk-Ins Today" value={String(view.walkinsToday)} />
        <Stat icon={Wallet} label="Revenue Today" value={peso(view.revenueToday)} note={`This month ${peso(view.revenueMonth)}`} />
        <Stat icon={Star} label="Rating (this month)" value={view.rating !== null ? `${view.rating} ★` : "—"} note={`${view.reviewCount} review${view.reviewCount === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Rest of Today's Schedule" action={<Link href="/frontdesk/appointments" className="text-xs font-semibold text-coral-dark hover:underline">Open Front Desk</Link>}>
          {view.upcoming.length === 0 ? (
            <p className="rounded-xl bg-cream py-6 text-center text-sm text-ink/50">No more appointments today at {branchName}.</p>
          ) : (
            <ul className="divide-y divide-nude/50">
              {view.upcoming.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex w-20 shrink-0 items-center gap-1 text-ink/60">
                    <Clock className="h-3.5 w-3.5" /> {fmtTime(a.time)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{a.clientName}</span>
                    <span className="block truncate text-xs text-ink/55">
                      {a.services.join(", ") || "Appointment"}
                      {a.staffName ? ` · ${a.staffName}` : ""}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${apptState(a) === "in_service" ? "bg-green-100 text-green-700" : "bg-skin text-coral-dark"}`}>
                    {apptState(a) === "in_service" ? "In Service" : a.visitType === "walk_in" ? "Walk-in" : "Upcoming"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Staff On Duty (${onDuty.length})`} action={<span className="text-xs text-ink/50">{view.monthBookings} bookings this month</span>}>
          {onDuty.length === 0 ? (
            <p className="rounded-xl bg-cream py-6 text-center text-sm text-ink/50">No staff have punched in yet today.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {onDuty.map((s) => (
                <li key={s.name} className="flex items-center gap-2 rounded-xl border border-nude/60 px-3 py-2 text-sm">
                  <UserCheck className="h-4 w-4 text-coral-dark" />
                  <span className="flex-1 truncate text-ink">{s.name}</span>
                  <span className="text-xs capitalize text-ink/55">{s.status.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Reviews ─────────────────────────────────────────────────────────────

type BranchReview = {
  id: string;
  type: "service" | "staff" | "branch";
  rating: number;
  text: string | null;
  status: string;
  created_at: string;
  client: string;
  target: string;
  photos: number;
};

export function BranchReviewsTab({ branchId }: { branchId: string }) {
  const [reviews, setReviews] = useState<BranchReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"all" | BranchReview["type"]>("all");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const select =
      "id, target_type, rating, text, status, created_at, client:profiles!reviews_client_id_fkey(full_name), staff:staff_members(full_name), branch:branches(name), service:branch_services(name), review_photos(count)";
    type Rel<T> = T | T[] | null;
    const one = <T,>(v: Rel<T>): T | null => (!v ? null : Array.isArray(v) ? (v[0] ?? null) : v);
    type Row = {
      id: string;
      target_type: BranchReview["type"];
      rating: number;
      text: string | null;
      status: string;
      created_at: string;
      client: Rel<{ full_name: string | null }>;
      staff: Rel<{ full_name: string }>;
      branch: Rel<{ name: string }>;
      service: Rel<{ name: string }>;
      review_photos: { count: number }[] | null;
    };
    // Branch reviews, plus staff/service reviews from visits at this branch.
    Promise.all([
      supabase.from("reviews").select(select).eq("branch_id", branchId).order("created_at", { ascending: false }).limit(500),
      supabase.from("reviews").select(`${select}, appointment:appointments!inner(branch_id)`).eq("appointment.branch_id", branchId).order("created_at", { ascending: false }).limit(500),
    ]).then(([a, b]) => {
      if (cancelled) return;
      logQueryError("BranchReviews direct", a.error);
      logQueryError("BranchReviews via visits", b.error);
      if (a.error && b.error) return setError("Couldn't load reviews.");
      const map = new Map<string, BranchReview>();
      for (const r of [...((a.data ?? []) as unknown as Row[]), ...((b.data ?? []) as unknown as Row[])]) {
        map.set(r.id, {
          id: r.id,
          type: r.target_type,
          rating: r.rating,
          text: r.text,
          status: r.status,
          created_at: r.created_at,
          client: one(r.client)?.full_name ?? "Client",
          target: r.target_type === "staff" ? one(r.staff)?.full_name ?? "Staff" : r.target_type === "branch" ? one(r.branch)?.name ?? "Branch" : one(r.service)?.name ?? "Service",
          photos: r.review_photos?.[0]?.count ?? 0,
        });
      }
      setReviews([...map.values()].sort((x, y) => y.created_at.localeCompare(x.created_at)));
    });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (!reviews) return <Loading error={error} />;
  const counted = reviews.filter((r) => r.status !== "removed");
  const average = counted.length ? Math.round((counted.reduce((s, r) => s + r.rating, 0) / counted.length) * 10) / 10 : null;
  const shown = reviews.filter((r) => type === "all" || r.type === type);
  const STATUS: Record<string, string> = { visible: "bg-green-100 text-green-700", flagged: "bg-amber-100 text-amber-700", hidden: "bg-amber-100 text-amber-700", removed: "bg-red-100 text-red-600" };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card title="Rating Summary">
          <p className="text-4xl font-semibold text-ink">{average !== null ? average : "—"}</p>
          <p className="flex items-center gap-1 text-sm text-ink/60">
            <Star className="h-4 w-4 fill-coral text-coral" /> {counted.length} review{counted.length === 1 ? "" : "s"}
          </p>
          <div className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => {
              const n = counted.filter((r) => r.rating === s).length;
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-ink/70">{s}★</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-skin">
                    <div className="h-full rounded-full bg-coral" style={{ width: `${counted.length ? (n / counted.length) * 100 : 0}%` }} />
                  </div>
                  <span className="w-6 text-right text-ink/70">{n}</span>
                </div>
              );
            })}
          </div>
          <Link href={`/admin/reviews?branch=${branchId}`} className="mt-4 inline-block text-sm font-semibold text-coral-dark hover:underline">
            Manage in Reviews →
          </Link>
        </Card>

        <Card
          title="Reviews"
          action={
            <div className="flex gap-1 text-xs font-medium">
              {(["all", "branch", "staff", "service"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} className={`rounded-full px-3 py-1 capitalize ${type === t ? "bg-coral text-white" : "bg-cream text-ink/70 hover:bg-skin"}`}>
                  {t}
                </button>
              ))}
            </div>
          }
        >
          {shown.length === 0 ? (
            <p className="rounded-xl bg-cream py-6 text-center text-sm text-ink/50">No reviews yet.</p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-nude/50 overflow-y-auto pr-1">
              {shown.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-coral">{"★".repeat(r.rating)}<span className="text-nude">{"★".repeat(5 - r.rating)}</span></span>
                    <span className="rounded-full bg-skin px-2 py-0.5 text-[11px] font-semibold capitalize text-coral-dark">{r.type}</span>
                    <span className="font-medium text-ink">{r.target}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS[r.status] ?? "bg-cream text-ink/60"}`}>{r.status}</span>
                  </div>
                  {r.text && <p className="mt-1 text-sm text-ink/80">{r.text}</p>}
                  <p className="mt-1 text-xs text-ink/50">
                    {r.client} · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {r.photos > 0 && ` · ${r.photos} photo${r.photos === 1 ? "" : "s"}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Analytics ───────────────────────────────────────────────────────────

export function BranchAnalyticsTab({ branchId }: { branchId: string }) {
  const [days, setDays] = useState(30);
  const to = todayKey();
  const from = addDays(to, -(days - 1));
  const { data, error } = useBranchData(from, to);

  const view = useMemo(() => {
    if (!data) return null;
    const f: ReportFilters = { from, to, branchId, staffId: null, service: null, status: null, rating: null };
    const sales = buildReport("sales", data, f);
    const appts = buildReport("appointments", data, f);
    const services = buildReport("services", data, f);
    const staff = buildReport("staff", data, f);
    const mine = data.appointments.filter((a) => a.branchId === branchId && a.date >= from && a.date <= to);
    return {
      sales,
      appts,
      daily: sales.sections[0].rows.map((r) => ({ label: String(r.date), value: Number(r.revenue) })),
      topServices: services.sections[0],
      staffTable: staff.sections[1],
      bookings: mine.filter((a) => a.visitType === "appointment").length,
      walkins: mine.filter((a) => a.visitType === "walk_in").length,
    };
  }, [data, from, to, branchId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">Real bookings, payments and reviews for this branch.</p>
        <div className="flex gap-1 rounded-full bg-white p-1 text-sm font-medium shadow-sm">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-full px-4 py-1.5 ${days === d ? "bg-coral text-white" : "text-ink/70 hover:bg-skin"}`}>
              Last {d} days
            </button>
          ))}
        </div>
      </div>

      {!view ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...view.sales.summary.slice(0, 2), ...view.appts.summary.slice(0, 2)].map((s) => (
              <div key={s.label} className="rounded-xl border border-nude/70 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/55">{s.label}</p>
                <p className="mt-1.5 text-2xl font-semibold text-ink">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Revenue by Day">
              <Bars rows={view.daily} money />
            </Card>
            <Card title="Appointment Outcomes">
              <Bars rows={view.appts.summary.slice(1).map((s) => ({ label: s.label, value: Number(s.value) || 0 }))} />
              <p className="mt-3 text-xs text-ink/55">
                {view.bookings} bookings · {view.walkins} walk-ins in this period
              </p>
            </Card>
            <Card title="Top Services">
              <Bars rows={view.topServices.rows.map((r) => ({ label: String(r.service), value: Number(r.bookings) }))} />
            </Card>
            <Card title="Revenue by Service">
              <Bars rows={view.sales.sections[3].rows.map((r) => ({ label: String(r.service), value: Number(r.revenue) }))} money />
            </Card>
          </div>

          <Card title="Staff Performance" action={<Link href="/admin/reports" className="text-xs font-semibold text-coral-dark hover:underline">Full reports →</Link>}>
            <SectionTable section={view.staffTable} />
          </Card>
        </>
      )}
    </div>
  );
}
