"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, CheckCheck, Link2, Play, Plus, Timer, UserRound, Wallet, X } from "lucide-react";
import { formatTime, type Appointment, type Context } from "@/lib/multiBranch/engine";
import type { DayVisit } from "@/lib/multiBranch/day";
import { PAYMENT_LABEL, WALKIN_LANES, walkinLane, type PaymentState, type WalkinLane } from "@/lib/multiBranch/boards";
import { createClient } from "@/lib/supabase/client";
import { checkInClient, updateSessionStatus } from "@/lib/supabase/queries/appointments";
import { Spinner, postJson } from "./ui";
import { Lane, LaneBoard, LaneCard, type LaneTone } from "./Lanes";
import { AppointmentPreview, type ApptPreview, type Done } from "./TransferPreview";
import { useCardDrag, type DragItem } from "./useCardDrag";

const TONE: Record<WalkinLane, LaneTone> = { waiting: "sky", in_service: "gold", time_reached: "peach", overdue: "rose", completed: "sage" };
const RUNNING: WalkinLane[] = ["in_service", "time_reached", "overdue"];

export const PAYMENT_CHIP: Record<PaymentState, string> = {
  unpaid: "bg-ink/5 text-ink/60",
  advance: "bg-[#F6ECD2] text-[#8A6A1C]",
  partial: "bg-[#F9E8D9] text-[#94602F]",
  paid: "bg-[#E6EDE2] text-[#4F6B4A]",
  verify: "bg-[#F6E3E3] text-[#9A5257]",
};
export function PaymentChip({ state }: { state: PaymentState }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_CHIP[state]}`}>
      <Wallet className="h-3 w-3" /> {PAYMENT_LABEL[state]}
    </span>
  );
}

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : null);

/**
 * Today's walk-ins by where they are in their visit. The timer moves a card
 * from In Service to Time Reached and Overdue, but only a person can complete
 * a service. Start / Complete use the same actions as the Front Desk.
 */
export default function WalkinBoard({
  ctx,
  branchId,
  query,
  refreshKey,
  onDone,
}: {
  ctx: Context;
  branchId: string;
  query: string;
  refreshKey: number;
  onDone: Done;
}) {
  const [visits, setVisits] = useState<DayVisit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reload, setReload] = useState(0);
  const [ask, setAsk] = useState<{ v: DayVisit; action: "start" | "complete" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [move, setMove] = useState<Appointment | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/multi-branch/day?date=${ctx.today}`)
      .then(async (r) => {
        const json = (await r.json()) as { visits?: DayVisit[]; error?: string };
        if (!alive) return;
        if (!r.ok) setError(json.error ?? "Couldn't load today's walk-ins.");
        else {
          setError(null);
          setVisits((json.visits ?? []).filter((v) => v.kind === "walk_in"));
        }
      })
      .catch(() => alive && setError("Couldn't load today's walk-ins."));
    return () => {
      alive = false;
    };
  }, [ctx.today, refreshKey, reload]);

  // The timers.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const branchName = (id: string) => ctx.branches.find((b) => b.id === id)?.name ?? "—";
  const q = query.trim().toLowerCase();
  const lanes = useMemo(() => {
    const map = new Map<WalkinLane, { v: DayVisit; elapsed: number; remaining: number }[]>(WALKIN_LANES.map((l) => [l.key, []]));
    for (const v of visits ?? []) {
      if (branchId !== "all" && v.branchId !== branchId) continue;
      if (q && !`${v.clientName} ${v.phone ?? ""} ${v.service} ${v.staffName ?? ""}`.toLowerCase().includes(q)) continue;
      const r = walkinLane(v, now);
      if (r.lane) map.get(r.lane)!.push({ v, elapsed: r.elapsed, remaining: r.remaining });
    }
    for (const list of map.values()) list.sort((a, b) => a.v.start - b.v.start);
    return map;
  }, [visits, branchId, q, now]);

  function laneOf(v: DayVisit) {
    return walkinLane(v, now).lane;
  }

  function request(v: DayVisit, to: WalkinLane) {
    const from = laneOf(v);
    setNotice(null);
    if (from === "waiting" && to === "in_service") {
      if (!v.staffName) return setNotice(`Assign a professional to ${v.clientName} at the Front Desk first.`);
      return setAsk({ v, action: "start" });
    }
    if (from && RUNNING.includes(from) && to === "completed") return setAsk({ v, action: "complete" });
    if (to === "time_reached" || to === "overdue") return setNotice("Time Reached and Overdue follow the timer — they can't be set by hand.");
    return setNotice("That step isn't possible — walk-ins go Waiting → In Service → Completed.");
  }

  async function apply() {
    if (!ask) return;
    setBusy(true);
    const sb = createClient();
    const res = ask.action === "start" ? await checkInClient(sb, ask.v.id) : await updateSessionStatus(sb, ask.v.id, "completed");
    setBusy(false);
    const v = ask.v;
    setAsk(null);
    if (res.error) return setNotice(res.error);
    onDone(ask.action === "start" ? `${v.clientName}'s service has started.` : `${v.clientName}'s service is completed.`, null);
    setReload((n) => n + 1);
  }

  async function openTransfer(v: DayVisit) {
    setNotice(null);
    try {
      const res = await postJson<ApptPreview>("/api/admin/multi-branch/preview", { type: "appointment", appointmentId: v.id, date: ctx.today });
      setMove(res.appointment);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  const onDrop = (item: DragItem, key: string) => {
    const v = visits?.find((x) => x.id === item.id);
    if (v) request(v, key as WalkinLane);
  };
  const { ghost, over, scroller, cardProps, columnRef, dragging } = useCardDrag(onDrop);
  const draggingVisit = dragging ? visits?.find((x) => x.id === dragging.id) ?? null : null;
  const allowed = (lane: WalkinLane) => {
    if (!draggingVisit) return null;
    const from = laneOf(draggingVisit);
    return (from === "waiting" && lane === "in_service") || (from && RUNNING.includes(from) && lane === "completed") ? "ok" : "no";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-ink/55">
          Today&apos;s walk-ins. <b>Start</b>{" "}begins the timer; when the estimated time is up the card moves to Time Reached, then Overdue — it&apos;s only completed when someone presses{" "}
          <b>Complete</b>.
        </p>
        <Link href="/frontdesk/walk-ins" className="flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white hover:bg-coral-dark">
          <Plus className="h-3.5 w-3.5" /> Register walk-in
        </Link>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {notice && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-[#F6E3E3] px-4 py-2 text-sm text-[#9A5257]">
          {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </p>
      )}
      {!visits && !error ? (
        <p className="flex items-center gap-2 px-1 text-sm text-ink/50"><Spinner /> Loading walk-ins…</p>
      ) : (
        <LaneBoard scrollerRef={scroller}>
          {WALKIN_LANES.map((lane) => {
            const list = lanes.get(lane.key) ?? [];
            return (
              <Lane
                key={lane.key}
                title={lane.label}
                hint={lane.hint}
                count={list.length}
                tone={TONE[lane.key]}
                laneRef={columnRef(lane.key)}
                highlight={over === lane.key ? allowed(lane.key) : null}
                empty={lane.key === "waiting" ? "No one waiting" : "Nothing here"}
              >
                {list.map(({ v, elapsed, remaining }) => {
                  const running = RUNNING.includes(lane.key);
                  const pct = Math.min(100, Math.round((elapsed / Math.max(1, v.duration)) * 100));
                  return (
                    <div key={v.id} {...cardProps({ kind: "appointment", id: v.id }, lane.key !== "completed")} data-grip="" className={`touch-none ${dragging?.id === v.id ? "opacity-40" : ""}`}>
                      <LaneCard className="cursor-grab active:cursor-grabbing">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{v.clientName}</p>
                            <p className="flex items-center gap-1 text-[10px] text-ink/50">
                              {v.hasAccount ? <><Link2 className="h-3 w-3" /> Linked account</> : <><UserRound className="h-3 w-3" /> Walk-in only</>}
                            </p>
                          </div>
                          <PaymentChip state={v.payment} />
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs text-ink/70" title={v.service}>{v.service}</p>
                        <p className="mt-1 truncate text-[11px] text-ink/50">
                          {v.staffName ?? "No professional yet"} · {branchName(v.branchId)}
                        </p>
                        {running ? (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                              <span className="flex items-center gap-1 text-ink/60"><Timer className="h-3 w-3" /> {elapsed} min · started {clock(v.serviceStartedAt) ?? formatTime(v.start)}</span>
                              <span className={remaining > 0 ? "text-[#4F6B4A]" : lane.key === "time_reached" ? "text-[#94602F]" : "text-[#9A5257]"}>
                                {remaining > 0 ? `${remaining} min left` : remaining === 0 ? "Time's up" : `Over by ${-remaining} min`}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/5">
                              <div className={`h-full rounded-full ${remaining > 0 ? "bg-[#C9A44A]" : lane.key === "time_reached" ? "bg-[#E0A872]" : "bg-[#C98E92]"}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-ink/50">
                            {lane.key === "waiting" ? `Arrived ${clock(v.arrivedAt) ?? formatTime(v.start)} · ${v.duration} min service` : `${v.duration} min service`}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                          {lane.key === "waiting" && (
                            <>
                              <button onClick={() => openTransfer(v)} className="flex items-center gap-1 rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-semibold text-ink/70 hover:border-coral hover:text-coral-dark">
                                <ArrowLeftRight className="h-3 w-3" /> Transfer
                              </button>
                              <button onClick={() => request(v, "in_service")} className="flex items-center gap-1 rounded-full bg-coral px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-coral-dark">
                                <Play className="h-3 w-3" /> Start
                              </button>
                            </>
                          )}
                          {running && (
                            <button onClick={() => request(v, "completed")} className="flex items-center gap-1 rounded-full bg-coral px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-coral-dark">
                              <CheckCheck className="h-3 w-3" /> Complete
                            </button>
                          )}
                          {(lane.key === "completed" || running) && v.payment !== "paid" && (
                            <Link href="/frontdesk/payments" className="flex items-center gap-1 rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-semibold text-ink/70 hover:border-coral hover:text-coral-dark">
                              <Wallet className="h-3 w-3" /> Take payment
                            </Link>
                          )}
                        </div>
                      </LaneCard>
                    </div>
                  );
                })}
              </Lane>
            );
          })}
        </LaneBoard>
      )}

      {ghost && draggingVisit && (
        <div className="pointer-events-none fixed left-0 top-0 z-[90] rounded-xl border border-coral bg-white p-2.5 shadow-2xl" style={{ width: ghost.w, transform: `translate(${ghost.x - ghost.ox}px, ${ghost.y - ghost.oy}px) rotate(2deg)` }}>
          <p className="text-sm font-semibold text-ink">{draggingVisit.clientName}</p>
          <p className="text-xs text-ink/50">Drop on the next step</p>
        </div>
      )}

      {ask && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink/40 p-4" onClick={() => !busy && setAsk(null)}>
          <div role="dialog" aria-label="Confirm" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-coral-dark">{ask.action === "start" ? "Waiting → In Service" : "In Service → Completed"}</p>
            <p className="mt-2 text-sm text-ink">
              {ask.action === "start"
                ? `Start ${ask.v.clientName}'s service with ${ask.v.staffName} now? The timer starts and ${ask.v.staffName} shows as In Service.`
                : `Mark ${ask.v.clientName}'s service as completed?${ask.v.payment !== "paid" ? " Payment is still due — take it at the Front Desk." : ""}`}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setAsk(null)} disabled={busy} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70">Cancel</button>
              <button onClick={apply} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy && <Spinner />} {ask.action === "start" ? "Start service" : "Complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {move && (
        <AppointmentPreview
          key={move.id}
          ctx={ctx}
          appt={move}
          conflict={null}
          initialBranchId={null}
          drawer
          onClose={() => setMove(null)}
          onDone={(text, logId) => {
            setMove(null);
            onDone(text, logId);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
