"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Columns3, Footprints, GripVertical, List, Move, Phone, Rows3, Scissors, UserRound, Wallet, X } from "lucide-react";
import { addDays, branchHours, formatDay, formatTime, isBranchActive, type Appointment, type Context } from "@/lib/multiBranch/engine";
import { layoutLanes, visitState, type DayVisit } from "@/lib/multiBranch/day";
import { Badge, Spinner, postJson } from "./ui";
import { AppointmentPreview, type ApptPreview, type Done, type Pick } from "./TransferPreview";
import { useCardDrag, type DragItem, type DropPoint } from "./useCardDrag";
import { PaymentChip } from "./WalkinBoard";
import { BranchDropBar } from "./Lanes";
import { KANBAN_COLUMNS, kanbanColumn, planStatusChange, type KanbanColumn, type StatusAction } from "@/lib/multiBranch/kanban";
import { createClient } from "@/lib/supabase/client";
import { checkInClient, confirmAppointment, markArrived, updateSessionStatus } from "@/lib/supabase/queries/appointments";

const NEXT_COLUMN: Partial<Record<KanbanColumn, KanbanColumn>> = { pending: "confirmed", confirmed: "checked_in", checked_in: "in_service", in_service: "completed" };

type Kind = "all" | "walk_in" | "booking";
const PX_PER_MIN = 1.5;
// Walk-ins in gold, bookings in blue (inside .status-colors these are real hues).
const KIND_STYLE = {
  walk_in: { block: "border-[#C9A84A] bg-[#FBF3DC]", chip: "bg-[#FBF3DC] text-[#8A6D1F]", dot: "bg-[#C9A84A]", label: "Walk-in" },
  booking: { block: "border-blue-500 bg-blue-50", chip: "bg-blue-100 text-blue-700", dot: "bg-blue-500", label: "Booking" },
} as const;

const TONE_CHIP = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  gray: "bg-ink/10 text-ink/55",
} as const;

/** Only visits that haven't started can be moved (same rule as the board and the database). */
const NOT_STARTED = ["arrived", "waiting", "ready", "late_arrival", "in_service", "completed", "paid", "no_show"];
const SNAP = 15;

/** Who walked in and who was booked on a day, per branch, on a timeline or as a list.
 * Drag a booking or walk-in to another branch (or time) to move it — the move is
 * previewed and checked first, exactly like on the Staff board. */
export default function DayTimeline({
  ctx,
  refreshKey,
  onDone,
  defaultMode = "timeline",
  defaultKind = "all",
  branchId = "all",
  query = "",
}: {
  ctx: Context;
  refreshKey: number;
  onDone: Done;
  defaultMode?: "timeline" | "kanban" | "list";
  defaultKind?: Kind;
  /** From the page header: one branch or all. */
  branchId?: string;
  /** From the page header search. */
  query?: string;
}) {
  const [date, setDate] = useState(ctx.today);
  const [visits, setVisits] = useState<DayVisit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [mode, setMode] = useState<"timeline" | "kanban" | "list">(defaultMode);
  const [statusMove, setStatusMove] = useState<{ visit: DayVisit; to: KanbanColumn; action: StatusAction; question: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [move, setMove] = useState<{ appt: Appointment; pick: Pick | null } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

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

  const q = query.trim().toLowerCase();
  const day = useMemo(
    () =>
      (visits ?? []).filter(
        (v) =>
          (showCancelled || v.status !== "cancelled") &&
          (branchId === "all" || v.branchId === branchId) &&
          (!q || `${v.clientName} ${v.phone ?? ""} ${v.code ?? ""} ${v.service} ${v.staffName ?? ""}`.toLowerCase().includes(q))
      ),
    [visits, showCancelled, branchId, q]
  );
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
  const canMove = (v: DayVisit) =>
    date >= ctx.today && (v.status === "pending" || v.status === "confirmed") && !NOT_STARTED.includes(v.sessionStatus ?? "");
  const snapStart = (at: DropPoint) => Math.max(range.start, range.start + Math.round(at.top / PX_PER_MIN / SNAP) * SNAP);

  // Dropped on a column: load the visit as the move tool sees it, then open
  // the move preview with that branch and time already chosen (and checked).
  async function onDrop(item: DragItem, key: string, at: DropPoint) {
    const v = (visits ?? []).find((x) => x.id === item.id);
    if (!v) return;
    if (key.startsWith("k:")) return askStatus(v, key.slice(2) as KanbanColumn);
    // Kanban: dropped on a branch in the transfer strip — same time, that branch.
    if (key.startsWith("kb:")) {
      if (!canMove(v)) return setMoveError(`${v.clientName}'s visit has started or passed, so it can't be moved.`);
      return openMove(v, { branchId: key.slice(3), start: v.start });
    }
    const branchId = key;
    const start = snapStart(at);
    if (branchId === v.branchId && start === v.start) return;
    await openMove(v, { branchId, start });
  }

  // Opens the move preview. With a slot (from a drop) it's checked straight
  // away and the best free, qualified staff member is picked automatically.
  async function openMove(v: DayVisit, slot: { branchId: string; start: number } | null) {
    setMoveError(null);
    setOpening(true);
    try {
      const res = await postJson<ApptPreview>("/api/admin/multi-branch/preview", { type: "appointment", appointmentId: v.id, date });
      const appt = res.appointment;
      setSelected(null);
      setMove({ appt, pick: slot ? { branchId: slot.branchId, staffId: null, date, start: slot.start } : null });
    } catch (e) {
      setMoveError((e as Error).message);
    }
    setOpening(false);
  }

  // Kanban: a status change is explained and confirmed before it's applied.
  function askStatus(v: DayVisit, to: KanbanColumn) {
    const plan = planStatusChange(kanbanColumn(v), to, { isToday: date === ctx.today, clientName: v.clientName });
    if (!plan.ok) return setMoveError(plan.reason);
    setMoveError(null);
    setStatusMove({ visit: v, to, action: plan.action, question: plan.question });
  }

  async function applyStatus() {
    if (!statusMove) return;
    const { visit: v, action, to } = statusMove;
    setApplying(true);
    const sb = createClient();
    const res =
      action === "confirm"
        ? await confirmAppointment(sb, v.id)
        : action === "check_in"
          ? await markArrived(sb, v.id)
          : action === "start"
            ? kanbanColumn(v) === "checked_in"
              ? await updateSessionStatus(sb, v.id, "in_service")
              : await checkInClient(sb, v.id)
            : await updateSessionStatus(sb, v.id, "completed");
    setApplying(false);
    setStatusMove(null);
    if (res.error) return setMoveError(res.error);
    onDone(`${v.clientName} → ${KANBAN_COLUMNS.find((c) => c.key === to)?.label}.`, null);
  }
  const { ghost, over, overPoint, scroller, cardProps, columnRef, dragging } = useCardDrag(onDrop);
  const draggingVisit = dragging ? ((visits ?? []).find((x) => x.id === dragging.id) ?? null) : null;

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
                ["timeline", "Calendar", Rows3],
                ["kanban", "Kanban", Columns3],
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
      {moveError && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          {moveError}
          <button onClick={() => setMoveError(null)} aria-label="Dismiss" className="text-red-700/60 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </p>
      )}
      {visits && mode !== "list" && (mode === "kanban" || date >= ctx.today) && (
        <p className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-ink/50">
          <Move className="h-3.5 w-3.5 text-coral-dark" />
          {mode === "kanban"
            ? "Drag a card to the next status (or open it and use “Next step”) — you’ll confirm before anything changes."
            : "Drag a booking or walk-in to another branch or time to move it — GlowSync picks free staff and checks everything before you confirm."}
          {opening && (
            <span className="ml-1 flex items-center gap-1 text-coral-dark">
              <Spinner /> Checking…
            </span>
          )}
        </p>
      )}
      {!visits && !error && (
        <p className="flex items-center gap-2 text-sm text-ink/50">
          <Spinner /> Loading the day…
        </p>
      )}

      {visits && mode !== "list" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-ink/55" aria-label="Legend">
          <span className="flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-sm bg-blue-500" /> Booking</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-sm bg-[#C9A84A]" /> Walk-in</span>
          <span className="h-3 w-px bg-ink/10" aria-hidden />
          {(
            [
              ["amber", "Pending"],
              ["blue", "Confirmed / arrived"],
              ["green", "Done"],
              ["red", "No-show"],
              ["gray", "Cancelled"],
            ] as const
          ).map(([tone, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${dot(tone)}`} /> {label}
            </span>
          ))}
          {mode === "timeline" && (
            <>
              <span className="h-3 w-px bg-ink/10" aria-hidden />
              <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-[repeating-linear-gradient(135deg,rgba(43,26,16,0.07)_0_4px,transparent_4px_8px)] ring-1 ring-ink/10" /> Branch closed</span>
            </>
          )}
        </div>
      )}

      {visits && mode === "timeline" && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div ref={scroller} className="max-h-[calc(100dvh-12rem)] overflow-auto rounded-2xl bg-white shadow-sm [scrollbar-color:rgba(201,168,74,0.5)_transparent] [scrollbar-width:thin]">
            <div className="flex min-w-full">
              {/* Hours */}
              <div className="sticky left-0 z-20 w-16 shrink-0 border-r border-ink/5 bg-white">
                <div className="sticky top-0 z-10 h-16 border-b border-ink/5 bg-white" />
                <div className="relative" style={{ height }}>
                  {hours.map((h) => (
                    <span key={h} className={`absolute right-2 text-[11px] font-semibold text-ink/50 ${h === range.start ? "translate-y-0.5" : "-translate-y-1/2"}`} style={{ top: (h - range.start) * PX_PER_MIN }}>
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
                  <div
                    key={b.id}
                    className={`min-w-0 flex-1 border-r border-ink/5 transition-colors ${dragging && over === b.id ? "bg-[#fff8e6]" : ""}`}
                    style={{ minWidth: `max(13.5rem, ${maxLanes * 8}rem)` }}
                  >
                    <div className="sticky top-0 z-10 h-16 border-b border-ink/5 bg-white px-3 py-2">
                      <p className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold text-ink">{b.name}</span>
                        <span className="shrink-0 text-[11px] font-medium text-ink/45">{formatTime(open)} – {formatTime(close)}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-ink/55">
                        <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${KIND_STYLE.booking.dot}`} />{list.length - walkIns} booking{list.length - walkIns === 1 ? "" : "s"}</span>
                        <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${KIND_STYLE.walk_in.dot}`} />{walkIns} walk-in{walkIns === 1 ? "" : "s"}</span>
                      </p>
                    </div>
                    <div ref={columnRef(b.id)} className="relative" style={{ height }}>
                      {/* Where a dragged visit would land */}
                      {draggingVisit && overPoint?.key === b.id && (
                        <div
                          className="pointer-events-none absolute inset-x-1 z-30 rounded-lg border-2 border-dashed border-coral bg-coral/10"
                          style={{ top: (snapStart(overPoint) - range.start) * PX_PER_MIN, height: Math.max(draggingVisit.duration * PX_PER_MIN, 30) }}
                        >
                          <span className="absolute -top-6 left-0 whitespace-nowrap rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                            {formatTime(snapStart(overPoint))}
                            {b.id !== draggingVisit.branchId && ` · ${b.name}`}
                          </span>
                        </div>
                      )}
                      {/* Closed hours: hatched and labelled */}
                      {(
                        [
                          ["top", 0, Math.max(0, (open - range.start) * PX_PER_MIN)],
                          ["bottom", (close - range.start) * PX_PER_MIN, Math.max(0, (range.end - close) * PX_PER_MIN)],
                        ] as const
                      ).map(([k, top, hgt]) =>
                        hgt > 0 ? (
                          <div
                            key={k}
                            className="absolute inset-x-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,rgba(43,26,16,0.05)_0_6px,transparent_6px_12px)]"
                            style={{ top, height: hgt }}
                          >
                            {hgt >= 28 && <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/40">Closed</span>}
                          </div>
                        ) : null
                      )}
                      {hours.map((h) => (
                        <div key={h} className="absolute inset-x-0 border-t border-ink/10" style={{ top: (h - range.start) * PX_PER_MIN }} />
                      ))}
                      {hours.slice(0, -1).map((h) => (
                        <div key={`half-${h}`} className="absolute inset-x-0 border-t border-dashed border-ink/[0.06]" style={{ top: (h + 30 - range.start) * PX_PER_MIN }} />
                      ))}
                      {nowTop !== null && (
                        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: nowTop }}>
                          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
                          <span className="absolute right-1 -top-[18px] rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">Now {formatTime(ctx.nowMinutes)}</span>
                        </div>
                      )}
                      {list.map((v) => {
                        const s = visitState(v);
                        const top = (v.start - range.start) * PX_PER_MIN;
                        const h = Math.max(v.duration * PX_PER_MIN, 30);
                        const tall = h >= 64;
                        const movable = canMove(v);
                        const inactive = v.status === "cancelled" || v.sessionStatus === "no_show";
                        return (
                          <button
                            key={v.id}
                            {...cardProps({ kind: "appointment", id: v.id }, movable)}
                            data-grip={movable ? "" : undefined}
                            onClick={() => setSelected(v.id === selected ? null : v.id)}
                            title={`${formatTime(v.start)} ${v.clientName} — ${v.service}`}
                            className={`absolute flex flex-col justify-start overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left shadow-sm transition hover:z-20 hover:shadow-md ${KIND_STYLE[v.kind].block} ${
                              selected === v.id ? "z-20 ring-2 ring-coral" : ""
                            } ${inactive ? "opacity-55 saturate-50" : ""} ${movable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"} ${dragging?.id === v.id ? "opacity-40" : ""}`}
                            style={{ top: top + 1, height: h - 2, left: `calc(${(v.lane / v.lanes) * 100}% + 4px)`, width: `calc(${100 / v.lanes}% - 8px)` }}
                          >
                            <span className="flex items-center justify-between gap-1">
                              <span className={`flex min-w-0 items-center gap-0.5 text-xs font-bold text-ink ${v.status === "cancelled" ? "line-through" : ""}`}>
                                {movable && <GripVertical className="-ml-1 h-3 w-3 shrink-0 text-ink/30" aria-hidden />}
                                <span className="truncate">{v.clientName}</span>
                              </span>
                              <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${TONE_CHIP[s.tone]}`}>{s.label}</span>
                            </span>
                            <span className="block truncate text-[11px] text-ink/60">
                              {formatTime(v.start)}–{formatTime(v.start + v.duration)}
                              {!tall && ` · ${v.service}`}
                            </span>
                            {tall && <span className="block truncate text-[11px] font-medium text-ink/70">{v.service}</span>}
                            {tall && (
                              <span className="mt-auto flex items-center gap-1 truncate text-[11px] text-ink/50">
                                <UserRound className="h-3 w-3 shrink-0" aria-hidden /> {v.staffName ?? "Any staff"}
                                {v.paid && <Wallet className="ml-auto h-3 w-3 shrink-0 text-green-600" aria-label="Paid" />}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {list.length === 0 && (
                        <p className="absolute inset-x-3 rounded-xl border-2 border-dashed border-ink/10 bg-white/70 py-4 text-center text-xs text-ink/40" style={{ top: Math.max(0, (open - range.start) * PX_PER_MIN) + 12 }}>
                          No {kind === "walk_in" ? "walk-ins" : kind === "booking" ? "bookings" : "visits"} this day
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side column: the visit's details (the move preview slides in over the page) */}
          {!move && (
            chosen && (
              <VisitDetails
                visit={chosen}
                branchName={branchName(chosen.branchId)}
                onClose={() => setSelected(null)}
                onMove={canMove(chosen) ? () => openMove(chosen, null) : undefined}
                onNext={NEXT_COLUMN[kanbanColumn(chosen)] ? () => askStatus(chosen, NEXT_COLUMN[kanbanColumn(chosen)]!) : undefined}
                nextLabel={KANBAN_COLUMNS.find((c) => c.key === NEXT_COLUMN[kanbanColumn(chosen)])?.label}
              />
            )
          )}
        </div>
      )}

      {/* The card under the pointer while dragging */}
      {ghost && draggingVisit && (
        <div
          className={`pointer-events-none fixed z-[100] rounded-lg border-l-4 px-2 py-1 text-left shadow-xl ring-2 ring-coral/60 ${KIND_STYLE[draggingVisit.kind].block}`}
          style={{ left: ghost.x - ghost.ox, top: ghost.y - ghost.oy, width: Math.min(ghost.w, 260) }}
        >
          <p className="truncate text-xs font-bold text-ink">{draggingVisit.clientName}</p>
          <p className="truncate text-[11px] text-ink/60">{draggingVisit.service}</p>
        </div>
      )}


      {visits && mode === "kanban" && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-3">
          <BranchDropBar
            branches={ctx.branches}
            dragging={!!draggingVisit}
            over={over}
            zoneRef={columnRef}
            keyFor={(id) => `kb:${id}`}
            check={(id) => {
              if (!draggingVisit) return null;
              if (!canMove(draggingVisit)) return { ok: false, text: "Started or past — can't move" };
              if (!isBranchActive(ctx.branches.find((b) => b.id === id))) return { ok: false, text: "Branch isn't open" };
              return { ok: true, text: id === draggingVisit.branchId ? "Drop to change time or staff here" : "Drop to see free staff and times" };
            }}
            label="Drag a booking onto a branch to move it — free staff are picked for you"
          />
          <div ref={scroller} className="overflow-x-auto pb-2 [scrollbar-color:rgba(201,168,74,0.5)_transparent] [scrollbar-width:thin]">
            <div className="flex min-w-max gap-3">
              {KANBAN_COLUMNS.filter((c) => c.key !== "closed" || showCancelled).map((col) => {
                const cards = shown.filter((v) => kanbanColumn(v) === col.key).sort((a, b) => a.start - b.start);
                const isOver = !!dragging && over === `k:${col.key}`;
                return (
                  <section
                    key={col.key}
                    aria-label={col.label}
                    className={`flex w-64 shrink-0 flex-col rounded-2xl border bg-white/70 transition ${isOver ? "border-coral bg-[#fff8e6] shadow-md" : "border-ink/5"}`}
                  >
                    <header className="flex items-center justify-between rounded-t-2xl border-b border-ink/5 bg-white px-3 py-2.5">
                      <h3 className="text-sm font-semibold text-ink">{col.label}</h3>
                      <span className="rounded-full bg-ink/5 px-2 text-xs font-semibold text-ink/60">{cards.length}</span>
                    </header>
                    <div ref={columnRef(`k:${col.key}`)} className="max-h-[calc(100dvh-16rem)] min-h-40 flex-1 space-y-2 overflow-y-auto p-2">
                      {cards.map((v) => {
                        const s = visitState(v);
                        const movable = col.key !== "closed";
                        return (
                          <button
                            key={v.id}
                            {...cardProps({ kind: "appointment", id: v.id }, movable)}
                            data-grip={movable ? "" : undefined}
                            onClick={() => setSelected(v.id === selected ? null : v.id)}
                            className={`block w-full rounded-xl border-l-4 bg-white p-2.5 text-left shadow-sm transition hover:shadow-md ${KIND_STYLE[v.kind].block} ${
                              selected === v.id ? "ring-2 ring-coral" : ""
                            } ${movable ? "cursor-grab touch-none active:cursor-grabbing" : "opacity-60"} ${dragging?.id === v.id ? "opacity-40" : ""}`}
                          >
                            <span className="flex items-center justify-between gap-1">
                              <span className="flex min-w-0 items-center gap-0.5 text-sm font-bold text-ink">
                                {movable && <GripVertical className="-ml-1 h-3.5 w-3.5 shrink-0 text-ink/30" aria-hidden />}
                                <span className="truncate">{v.clientName}</span>
                              </span>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${dot(s.tone)}`} title={s.label} />
                            </span>
                            <span className="mt-0.5 block text-xs text-ink/60">
                              {formatTime(v.start)}–{formatTime(v.start + v.duration)} · {branchName(v.branchId)}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink/55" title={v.service}>{v.service}</span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-1">
                              <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${KIND_STYLE[v.kind].chip}`}>
                                {v.kind === "walk_in" ? <Footprints className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
                                {KIND_STYLE[v.kind].label}
                              </span>
                              <span className="truncate text-[11px] text-ink/45">{v.staffName ?? "Any staff"}</span>
                              <PaymentChip state={v.payment} />
                            </span>
                          </button>
                        );
                      })}
                      {cards.length === 0 && <p className="rounded-xl border-2 border-dashed border-ink/10 py-6 text-center text-xs text-ink/35">Nothing here</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          </div>
          {chosen && (
            <VisitDetails
              visit={chosen}
              branchName={branchName(chosen.branchId)}
              onClose={() => setSelected(null)}
              onMove={canMove(chosen) ? () => openMove(chosen, null) : undefined}
              onNext={NEXT_COLUMN[kanbanColumn(chosen)] ? () => askStatus(chosen, NEXT_COLUMN[kanbanColumn(chosen)]!) : undefined}
              nextLabel={KANBAN_COLUMNS.find((c) => c.key === NEXT_COLUMN[kanbanColumn(chosen)])?.label}
            />
          )}
        </div>
      )}

      {/* Move preview: slides in from the right, over the calendar (never squeezes it) */}
      {move && (
        <AppointmentPreview
          key={`${move.appt.id}-${move.pick?.branchId ?? ""}-${move.pick?.start ?? ""}`}
          ctx={ctx}
          appt={move.appt}
          conflict={null}
          initialBranchId={move.pick?.branchId ?? null}
          initialPick={move.pick}
          drawer
          onClose={() => setMove(null)}
          onDone={(text, logId) => {
            setMove(null);
            onDone(text, logId);
          }}
        />
      )}

      {/* Status change confirmation */}
      {statusMove && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink/40 p-4" onClick={() => !applying && setStatusMove(null)}>
          <div role="dialog" aria-label="Confirm status change" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-coral-dark">
              {KANBAN_COLUMNS.find((c) => c.key === kanbanColumn(statusMove.visit))?.label} → {KANBAN_COLUMNS.find((c) => c.key === statusMove.to)?.label}
            </p>
            <p className="mt-2 text-sm text-ink">{statusMove.question}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setStatusMove(null)} disabled={applying} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70">
                Cancel
              </button>
              <button onClick={applyStatus} disabled={applying} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {applying && <Spinner />} Yes, update
              </button>
            </div>
          </div>
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
                        <span className="ml-1 inline-block align-middle"><PaymentChip state={v.payment} /></span>
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

function VisitDetails({
  visit: v,
  branchName,
  onClose,
  onMove,
  onNext,
  nextLabel,
}: {
  visit: DayVisit;
  branchName: string;
  onClose: () => void;
  /** Keyboard-friendly alternative to dragging. */
  onMove?: () => void;
  onNext?: () => void;
  nextLabel?: string;
}) {
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
        <PaymentChip state={v.payment} />
        {v.code && <Badge tone="gray">#{v.code}</Badge>}
      </div>
      {(onMove || onNext) && (
        <div className="mt-4 space-y-2 border-t border-ink/5 pt-3">
          {onNext && nextLabel && (
            <button onClick={onNext} className="flex w-full items-center justify-center gap-1.5 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
              Next step: {nextLabel} <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {onMove && (
            <button onClick={onMove} className="flex w-full items-center justify-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/75 hover:border-coral hover:text-coral-dark">
              <Move className="h-4 w-4" /> Move branch or time…
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
