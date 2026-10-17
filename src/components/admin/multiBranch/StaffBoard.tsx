"use client";

import { ArrowLeftRight, CalendarClock, MapPin } from "lucide-react";
import { formatTime, staffStatus, toMinutes, type Context, type Staff } from "@/lib/multiBranch/engine";
import { STAFF_LANES, staffLane, type StaffLane } from "@/lib/multiBranch/boards";
import { Avatar } from "./ui";
import { Lane, LaneBoard, LaneCard, type LaneTone } from "./Lanes";

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
 * services and days off — the board never changes a status itself. Branch
 * moves go through Transfer (with its availability checks).
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
  onTransfer: (s: Staff) => void;
}) {
  const q = query.trim().toLowerCase();
  const branchName = (id: string | null) => ctx.branches.find((b) => b.id === id)?.name ?? "No branch";

  // Each person once: where they work that day (lent staff show at the branch they're lent to).
  const people = ctx.staff
    .map((s) => {
      const where = ctx.lends.find((l) => l.staffId === s.id && l.dates.includes(date))?.branchId ?? s.branchId;
      return { s, where };
    })
    .filter(({ s, where }) => (branchId === "all" || where === branchId) && (!q || `${s.name} ${s.department} ${branchName(where)}`.toLowerCase().includes(q)));

  const lanes = new Map<StaffLane, { s: Staff; where: string | null }[]>(STAFF_LANES.map((l) => [l.key, []]));
  for (const p of people) lanes.get(p.where ? staffLane(staffStatus(ctx, p.s.id, p.where, date)) : "day_off")!.push(p);

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-ink/55">
        Columns follow Punch In, breaks and services, so a card can&apos;t be dragged into a status. Click a card for the schedule, or <b>Transfer</b> to lend or move
        someone to another branch (availability is checked first).
      </p>
      <LaneBoard>
        {STAFF_LANES.map((lane) => {
          const list = lanes.get(lane.key)!.sort((a, b) => a.s.name.localeCompare(b.s.name));
          return (
            <Lane key={lane.key} title={lane.label} hint={lane.hint} count={list.length} tone={TONE[lane.key]} empty="No one here">
              {list.map(({ s, where }) => {
                const today = ctx.appointments
                  .filter((a) => a.professionalId === s.id && a.date === date && (a.status === "pending" || a.status === "confirmed"))
                  .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
                const next = today.find((a) => date !== ctx.today || toMinutes(a.start) + a.duration > ctx.nowMinutes);
                const lent = where !== s.branchId;
                return (
                  <LaneCard key={s.id} onClick={() => where && onOpen(s, where)}>
                    <div className="flex items-center gap-2.5">
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
                          onTransfer(s);
                        }}
                        className="flex items-center gap-1 rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-semibold text-ink/70 hover:border-coral hover:text-coral-dark"
                      >
                        <ArrowLeftRight className="h-3 w-3" /> Transfer
                      </button>
                    </div>
                  </LaneCard>
                );
              })}
            </Lane>
          );
        })}
      </LaneBoard>
    </div>
  );
}
