"use client";

import { useState } from "react";
import { ArrowLeftRight, CalendarClock, GripVertical, MapPin, X } from "lucide-react";
import { checkStaffTransfer, formatTime, isBranchActive, staffStatus, toMinutes, type Context, type Staff } from "@/lib/multiBranch/engine";
import { STAFF_LANES, staffLane, type StaffLane } from "@/lib/multiBranch/boards";
import { Avatar } from "./ui";
import { BranchDropBar, Lane, LaneBoard, LaneCard, type LaneTone } from "./Lanes";
import { useCardDrag, type DragItem } from "./useCardDrag";

const TONE: Record<StaffLane, LaneTone> = {
  available: "sage",
  in_service: "gold",
  on_break: "peach",
  scheduled: "sky",
  day_off: "gray",
  out: "rose",
};

/**
 * Staff by what they're doing right now. Columns follow Punch In, Break,
 * services and days off — dragging into a column never changes a status.
 * Drag a card onto a branch (or press Transfer) to lend or move someone,
 * with the usual availability checks.
 */
export default function StaffBoard({
  ctx,
  date,
  branchId,
  query,
  onOpen,
  onTransfer,
}: {
  ctx: Context;
  date: string;
  branchId: string;
  query: string;
  onOpen: (s: Staff, branchId: string) => void;
  onTransfer: (s: Staff, toBranchId: string | null) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const branchName = (id: string | null) => ctx.branches.find((b) => b.id === id)?.name ?? "No branch";
  const whereOf = (s: Staff) => ctx.lends.find((l) => l.staffId === s.id && l.dates.includes(date))?.branchId ?? s.branchId;

  // Each person once: where they work that day (lent staff show at the branch they're lent to).
  const people = ctx.staff
    .map((s) => ({ s, where: whereOf(s) }))
    .filter(({ s, where }) => (branchId === "all" || where === branchId) && (!q || `${s.name} ${s.department} ${branchName(where)}`.toLowerCase().includes(q)));

  const lanes = new Map<StaffLane, { s: Staff; where: string | null }[]>(STAFF_LANES.map((l) => [l.key, []]));
  for (const p of people) lanes.get(p.where ? staffLane(staffStatus(ctx, p.s.id, p.where, date)) : "day_off")!.push(p);

  const onDrop = (item: DragItem, key: string) => {
    const s = ctx.staff.find((x) => x.id === item.id);
    if (!s) return;
    if (!key.startsWith("b:")) {
      return setNotice("Statuses follow Punch In, breaks and services, so they can't be changed by dragging. Drop the card on a branch above to transfer.");
    }
    const to = key.slice(2);
    if (to === s.branchId) return setNotice(`${s.name} already belongs to ${branchName(to)}.`);
    setNotice(null);
    onTransfer(s, to);
  };
  const { ghost, over, scroller, cardProps, columnRef, dragging } = useCardDrag(onDrop);
  const dragged = dragging ? ctx.staff.find((s) => s.id === dragging.id) ?? null : null;
  const check = (to: string) => {
    if (!dragged) return null;
    const b = ctx.branches.find((x) => x.id === to);
    if (to === dragged.branchId) return { ok: false, text: "Already their home branch" };
    if (!isBranchActive(b)) return { ok: false, text: "Branch isn't open" };
    const r = checkStaffTransfer(ctx, { staffId: dragged.id, toBranchId: to, kind: "temporary", dates: [date < ctx.today ? ctx.today : date] });
    return r.ok ? { ok: true, text: "Free that day — drop to review the transfer" } : { ok: true, text: "Needs a look — drop to see what to fix" };
  };

  return (
    <div className="space-y-2">
      <BranchDropBar
        branches={ctx.branches}
        dragging={!!dragged}
        over={over}
        zoneRef={columnRef}
        keyFor={(id) => `b:${id}`}
        check={check}
        label="Drag a staff card onto a branch to lend or move them"
      />
      {notice && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-[#F6E3E3] px-4 py-2 text-sm text-[#9A5257]">
          {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </p>
      )}
      <LaneBoard scrollerRef={scroller}>
        {STAFF_LANES.map((lane) => {
          const list = lanes.get(lane.key)!.sort((a, b) => a.s.name.localeCompare(b.s.name));
          return (
            <Lane key={lane.key} title={lane.label} hint={lane.hint} count={list.length} tone={TONE[lane.key]} empty="No one here" laneRef={columnRef(`lane:${lane.key}`)} highlight={dragged && over === `lane:${lane.key}` ? "no" : null}>
              {list.map(({ s, where }) => {
                const today = ctx.appointments
                  .filter((a) => a.professionalId === s.id && a.date === date && (a.status === "pending" || a.status === "confirmed"))
                  .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
                const next = today.find((a) => date !== ctx.today || toMinutes(a.start) + a.duration > ctx.nowMinutes);
                const lent = where !== s.branchId;
                return (
                  <div key={s.id} {...cardProps({ kind: "staff", id: s.id })} className={`touch-none ${dragging?.id === s.id ? "opacity-40" : ""}`}>
                    <LaneCard onClick={() => where && onOpen(s, where)} className="cursor-grab active:cursor-grabbing">
                      <div className="flex items-center gap-2.5">
                        <span data-grip className="-ml-1 text-ink/25" aria-hidden><GripVertical className="h-4 w-4" /></span>
                        <Avatar name={s.name} url={s.avatarUrl} size={38} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                          <p className="truncate text-xs text-ink/55">{s.department || "Staff"}</p>
                        </div>
                      </div>
                      <p className="mt-2 flex items-center gap-1 truncate text-[11px] text-ink/55">
                        <MapPin className="h-3 w-3 shrink-0 text-coral-dark" /> {branchName(where)}
                        {lent && <span className="rounded-full bg-[#fbebdc] px-1.5 font-semibold text-[#94602F]">lent</span>}
                      </p>
                      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-ink/60">
                        <CalendarClock className="h-3 w-3 shrink-0 text-coral-dark" />
                        {next ? `Next ${formatTime(toMinutes(next.start))} · ${next.clientName}` : "No more bookings"}
                        <span className="ml-auto shrink-0 text-ink/45">{today.length} today</span>
                      </p>
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTransfer(s, null);
                          }}
                          className="flex items-center gap-1 rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-semibold text-ink/70 hover:border-coral hover:text-coral-dark"
                        >
                          <ArrowLeftRight className="h-3 w-3" /> Transfer
                        </button>
                      </div>
                    </LaneCard>
                  </div>
                );
              })}
            </Lane>
          );
        })}
      </LaneBoard>

      {ghost && dragged && (
        <div className="pointer-events-none fixed left-0 top-0 z-[90] rounded-xl border border-coral bg-white p-2.5 shadow-2xl" style={{ width: ghost.w, transform: `translate(${ghost.x - ghost.ox}px, ${ghost.y - ghost.oy}px) rotate(2deg)` }}>
          <p className="text-sm font-semibold text-ink">{dragged.name}</p>
          <p className="text-xs text-ink/50">Drop on a branch to transfer</p>
        </div>
      )}
    </div>
  );
}
