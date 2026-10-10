"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Footprints, List, Phone, Rows3, Scissors, UserRound, Wallet, X } from "lucide-react";
import { addDays, branchHours, formatDay, formatTime, type Context } from "@/lib/multiBranch/engine";
import { layoutLanes, visitState, type DayVisit } from "@/lib/multiBranch/day";
import { Badge, Spinner } from "./ui";

type Kind = "all" | "walk_in" | "booking";
const PX_PER_MIN = 1.5;
// Walk-ins in gold, bookings in blue (inside .status-colors these are real hues).
const KIND_STYLE = {
  walk_in: { block: "border-[#C9A84A] bg-[#FBF3DC]", chip: "bg-[#FBF3DC] text-[#8A6D1F]", dot: "bg-[#C9A84A]", label: "Walk-in" },
  booking: { block: "border-blue-500 bg-blue-50", chip: "bg-blue-100 text-blue-700", dot: "bg-blue-500", label: "Booking" },
} as const;

/** Who walked in and who was booked on a day, per branch, on a timeline or as a list. */
export default function DayTimeline({ ctx, refreshKey }: { ctx: Context; refreshKey: number }) {
  const [date, setDate] = useState(ctx.today);
  const [visits, setVisits] = useState<DayVisit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [mode, setMode] = useState<"timeline" | "list">("timeline");
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/multi-branch/day?date=${date}`)
      .then(async (r) => {
        const json = (await r.json()) as { visits?: DayVisit[]; error?: string };
        if (!alive) return;
        if (!r.ok) setError(json.error ?? "Couldn't load the day.");
        else {
          setError(null);
          setVisits(json.visits ?? []);
        }
      })
      .catch(() => alive && setError("Couldn't load the day."));
    return () => {
      alive = false;
    };
  }, [date, refreshKey]);

  const day = useMemo(() => (visits ?? []).filter((v) => showCancelled || v.status !== "cancelled"), [visits, showCancelled]);
  const counts = { all: day.length, walk_in: day.filter((v) => v.kind === "walk_in").length, booking: day.filter((v) => v.kind === "booking").length };
  const shown = useMemo(() => day.filter((v) => kind === "all" || v.kind === kind), [day, kind]);
  const branchName = (id: string) => ctx.branches.find((b) => b.id === id)?.name ?? "—";
  const chosen = shown.find((v) => v.id === selected) ?? null;

  // One shared time axis: earliest opening to latest closing (and any visit outside it).
  const range = useMemo(() => {
    let open = Math.min(...ctx.branches.map((b) => branchHours(ctx, b.id).open));
    let close = Math.max(...ctx.branches.map((b) => branchHours(ctx, b.id).close));
    for (const v of shown) {
      open = Math.min(open, v.start);
      close = Math.max(close, v.start + v.duration);
    }
    return { start: Math.floor(open / 60) * 60, end: Math.ceil(close / 60) * 60 };
  }, [ctx, shown]);
  const hours = Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, i) => range.start + i * 60);
  const height = (range.end - range.start) * PX_PER_MIN;
  const nowTop = date === ctx.today && ctx.nowMinutes >= range.start && ctx.nowMinutes <= range.end ? (ctx.nowMinutes - range.start) * PX_PER_MIN : null;

  const chip = (k: Kind, label: string, icon: React.ReactNode) => (
    <button
      key={k}
      onClick={() => setKind(k)}
      aria-pressed={kind === k}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        kind === k ? (k === "all" ? "bg-ink text-white" : `${KIND_STYLE[k].chip} ring-2 ring-current/30`) : "bg-white text-ink/60 hover:text-ink"
      }`}
    >
      {icon} {label}
      <span className={`rounded-full px-1.5 text-xs ${kind === k && k === "all" ? "bg-white/20" : "bg-ink/5"}`}>{counts[k]}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1">
          <button onClick={() => setDate((d) => addDays(d, -1))} aria-label="Previous day" className="grid h-9 w-9 place-items-center rounded-full border border-ink/10 text-ink/60 hover:border-coral">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <label className="flex items-center gap-2 rounded-full border border-ink/10 px-3 py-1.5 text-sm text-ink">
            <CalendarDays className="h-4 w-4 text-coral-dark" />
            <span className="hidden font-semibold sm:inline">{formatDay(date, ctx.today)}</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day" className="bg-transparent text-sm outline-none" />
          </label>
          <button onClick={() => setDate((d) => addDays(d, 1))} aria-label="Next day" className="grid h-9 w-9 place-items-center rounded-full border border-ink/10 text-ink/60 hover:border-coral">
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== ctx.today && (
            <button onClick={() => setDate(ctx.today)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-coral-dark hover:bg-blush">
              Today
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-full bg-cream p-1">
          {chip("all", "All", <Rows3 className="h-4 w-4" />)}
          {chip("walk_in", "Walk-ins", <Footprints className="h-4 w-4" />)}
          {chip("booking", "Bookings", <CalendarDays className="h-4 w-4" />)}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink/60">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="h-4 w-4 accent-coral" />
            Show cancelled
          </label>
          <div className="flex rounded-full bg-cream p-1">
            {(
              [
                ["timeline", "Timeline", Rows3],
                ["list", "List", List],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${mode === m ? "bg-white text-ink shadow-sm" : "text-ink/50"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!visits && !error && (
        <p className="flex items-center gap-2 text-sm text-ink/50">
          <Spinner /> Loading the day…
        </p>
      )}

      {visits && mode === "timeline" && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-h-[calc(100dvh-12rem)] overflow-auto rounded-2xl bg-white shadow-sm [scrollbar-color:rgba(201,168,74,0.5)_transparent] [scrollbar-width:thin]">
            <div className="flex min-w-max">
              {/* Hours */}
              <div className="sticky left-0 z-20 w-16 shrink-0 border-r border-ink/5 bg-white">
                <div className="sticky top-0 z-10 h-16 border-b border-ink/5 bg-white" />
                <div className="relative" style={{ height }}>
                  {hours.map((h) => (
                    <span key={h} className={`absolute right-2 text-[11px] font-medium text-ink/40 ${h === range.start ? "translate-y-0.5" : "-translate-y-1/2"}`} style={{ top: (h - range.start) * PX_PER_MIN }}>
                      {formatTime(h).replace(":00", "")}
                    </span>
                  ))}
                </div>
              </div>

              {ctx.branches.map((b) => {
                const list = layoutLanes(shown.filter((v) => v.branchId === b.id));
                const { open, close } = branchHours(ctx, b.id);
                const walkIns = list.filter((v) => v.kind === "walk_in").length;
                // Wider lane when several visits overlap, so every block stays readable (~8.5rem each).
                const maxLanes = Math.max(1, ...list.map((v) => v.lanes));
                return (
                  <div key={b.id} className="shrink-0 border-r border-ink/5" style={{ width: `max(17rem, ${maxLanes * 8.5}rem)` }}>
                    <div className="sticky top-0 z-10 h-16 border-b border-ink/5 bg-white/95 px-3 py-2 backdrop-blur">
                      <p className="truncate font-semibold text-ink">{b.name}</p>
                      <p className="flex items-center gap-2 text-xs text-ink/50">
                        <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${KIND_STYLE.walk_in.dot}`} />{walkIns} walk-in</span>
                        <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${KIND_STYLE.booking.dot}`} />{list.length - walkIns} booking</span>
                      </p>
                    </div>
                    <div className="relative" style={{ height }}>
                      {/* Closed hours shaded */}
                      <div className="absolute inset-x-0 top-0 bg-ink/[0.035]" style={{ height: Math.max(0, (open - range.start) * PX_PER_MIN) }} />
                      <div className="absolute inset-x-0 bottom-0 bg-ink/[0.035]" style={{ height: Math.max(0, (range.end - close) * PX_PER_MIN) }} />
                      {hours.map((h) => (
                        <div key={h} className="absolute inset-x-0 border-t border-ink/5" style={{ top: (h - range.start) * PX_PER_MIN }} />
                      ))}
                      {nowTop !== null && (
                        <div className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: nowTop }}>
                          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
                        </div>
                      )}
                      {list.map((v) => {
                        const s = visitState(v);
                        const top = (v.start - range.start) * PX_PER_MIN;
                        const h = Math.max(v.duration * PX_PER_MIN, 30);
                        const tall = h >= 64;
                        return (
                          <button
                            key={v.id}
                            onClick={() => setSelected(v.id === selected ? null : v.id)}
                            title={`${formatTime(v.start)} ${v.clientName} — ${v.service}`}
                            className={`absolute flex flex-col justify-start overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left shadow-sm transition hover:z-20 hover:shadow-md ${KIND_STYLE[v.kind].block} ${
                              selected === v.id ? "z-20 ring-2 ring-coral" : ""
                            } ${v.status === "cancelled" ? "opacity-45" : ""}`}
                            style={{ top: top + 1, height: h - 2, left: `calc(${(v.lane / v.lanes) * 100}% + 4px)`, width: `calc(${100 / v.lanes}% - 8px)` }}
                          >
                            <span className="flex items-center justify-between gap-1">
                              <span className={`truncate text-xs font-bold text-ink ${v.status === "cancelled" ? "line-through" : ""}`}>{v.clientName}</span>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${dot(s.tone)}`} title={s.label} />
                            </span>
                            <span className="block truncate text-[11px] text-ink/60">
                              {formatTime(v.start)}–{formatTime(v.start + v.duration)}
                              {!tall && ` · ${v.service}`}
                            </span>
                            {tall && <span className="block truncate text-[11px] text-ink/60">{v.service}</span>}
                            {tall && v.staffName && <span className="block truncate text-[11px] text-ink/45">with {v.staffName}</span>}
                          </button>
                        );
                      })}
                      {list.length === 0 && (
                        <p className="absolute inset-x-3 top-6 rounded-xl border-2 border-dashed border-ink/10 py-4 text-center text-xs text-ink/35">
                          No {kind === "walk_in" ? "walk-ins" : kind === "booking" ? "bookings" : "visits"} this day
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {chosen && <VisitDetails visit={chosen} branchName={branchName(chosen.branchId)} onClose={() => setSelected(null)} />}
        </div>
      )}

      {visits && mode === "list" && (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/45">
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-3 py-3 font-semibold">Type</th>
                <th className="px-3 py-3 font-semibold">Client</th>
                <th className="px-3 py-3 font-semibold">Service</th>
                <th className="px-3 py-3 font-semibold">Staff</th>
                <th className="px-3 py-3 font-semibold">Branch</th>
                <th className="px-3 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...shown]
                .sort((a, b) => a.start - b.start || branchName(a.branchId).localeCompare(branchName(b.branchId)))
                .map((v) => {
                  const s = visitState(v);
                  return (
                    <tr key={v.id} className={`border-b border-ink/5 ${v.status === "cancelled" ? "opacity-50" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-ink">
                        {formatTime(v.start)}
                        <span className="block text-xs font-normal text-ink/45">{v.duration} min</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_STYLE[v.kind].chip}`}>
                          {v.kind === "walk_in" ? <Footprints className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
                          {KIND_STYLE[v.kind].label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-ink">{v.clientName}</span>
                        <span className="block text-xs text-ink/45">{v.phone ?? "No phone"}{v.hasAccount ? " · account" : ""}</span>
                      </td>
                      <td className="max-w-[14rem] px-3 py-2.5 text-ink/70">
                        <span className="line-clamp-2">{v.service}</span>
                      </td>
                      <td className="px-3 py-2.5 text-ink/70">{v.staffName ?? "Any"}</td>
                      <td className="px-3 py-2.5 text-ink/70">{branchName(v.branchId)}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {v.paid && <Wallet className="ml-1 inline h-3.5 w-3.5 text-green-600" aria-label="Paid" />}
                      </td>
                    </tr>
                  );
                })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink/45">
                    No {kind === "walk_in" ? "walk-ins" : kind === "booking" ? "bookings" : "visits"} on {formatDay(date, ctx.today)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function dot(tone: ReturnType<typeof visitState>["tone"]) {
  return { green: "bg-green-500", blue: "bg-blue-500", amber: "bg-amber-500", red: "bg-red-500", gray: "bg-ink/30" }[tone];
}

function VisitDetails({ visit: v, branchName, onClose }: { visit: DayVisit; branchName: string; onClose: () => void }) {
  const s = visitState(v);
  return (
    <aside className="h-fit w-full rounded-2xl bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:w-72">
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_STYLE[v.kind].chip}`}>
          {v.kind === "walk_in" ? <Footprints className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
          {KIND_STYLE[v.kind].label}
        </span>
        <button onClick={onClose} aria-label="Close details" className="text-ink/40 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-lg font-semibold text-ink">{v.clientName}</p>
      <p className="text-sm text-ink/55">
        {formatTime(v.start)}–{formatTime(v.start + v.duration)} · {branchName}
      </p>
      <div className="mt-3 space-y-1.5 text-sm text-ink/70">
        <p className="flex items-start gap-2"><Scissors className="mt-0.5 h-4 w-4 shrink-0 text-coral-dark" /> {v.service}</p>
        <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-coral-dark" /> {v.staffName ?? "Any available staff"}</p>
        <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-coral-dark" /> {v.phone ?? "No phone"}{v.hasAccount ? " · has an account" : " · no account"}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone={s.tone}>{s.label}</Badge>
        {v.paid && <Badge tone="green"><Wallet className="h-3 w-3" /> Paid</Badge>}
        {v.code && <Badge tone="gray">#{v.code}</Badge>}
      </div>
    </aside>
  );
}
