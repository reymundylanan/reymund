"use client";

import { useState } from "react";
import { ArrowLeftRight, CalendarClock, GripVertical, MapPin, X } from "lucide-react";
import { checkStaffTransfer, formatTime, isBranchActive, staffStatus, toMinutes, type Context, type Staff } from "@/lib/multiBranch/engine";
import { STAFF_LANES, staffLane, type StaffLane } from "@/lib/multiBranch/boards";
import { Avatar } from "./ui";
import { BranchDropBar, Lane, LaneBoard, LaneCard, type LaneTone } from "./Lanes";
import { useCardDrag, type DragItem } from "./useCardDrag";
import { Spinner } from "./ui";
import { planStaffDrop, type StaffAction } from "@/lib/multiBranch/dayOff";
import { endBreak, punchIn, punchOut, startBreak } from "@/lib/supabase/queries/staffAttendance";
import { createClient } from "@/lib/supabase/client";
import { upsertStaffOff } from "@/lib/supabase/queries/staffShifts";

const TONE: Record<StaffLane, LaneTone> = {
  available: "sage",
  in_service: "gold",
  on_break: "peach",
  scheduled: "sky",
  day_off: "gray",
  out: "rose",
};

/**
 * Staff by what they're doing right now. Dragging a card (asked first):
 * onto Available / On Break / Out runs today's Punch In, break or Punch Out
 * (the same actions as the Front Desk); onto Day Off gives a day off, back
 * to Scheduled removes it. In Service follows the services themselves.
 * Drag a card onto a branch (or press Transfer) to lend or move someone.
 */
export default function StaffBoard({
  ctx,
  date,
  branchId,
  query,
  onOpen,
  onTransfer,
  onChanged,
}: {
  ctx: Context;
  date: string;
  branchId: string;
  query: string;
  onOpen: (s: Staff, branchId: string) => void;
  onTransfer: (s: Staff, toBranchId: string | null) => void;
  /** A day off or attendance changed (reload the board). */
  onChanged: (text: string) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  // Day off / attendance by dragging: asked first, then saved.
  const [ask, setAsk] = useState<{ s: Staff; action: StaffAction; question: string } | null>(null);
  const [saving, setSaving] = useState(false);
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
    if (key.startsWith("lane:")) {
      const plan = planStaffDrop(ctx, s, whereOf(s), date, key.slice(5) as StaffLane);
      if (!plan.ok) return setNotice(plan.reason);
      setNotice(null);
      return setAsk({ s, action: plan.action, question: plan.question });
    }
    const to = key.slice(2);
    if (to === s.branchId) return setNotice(`${s.name} already belongs to ${branchName(to)}.`);
    setNotice(null);
    onTransfer(s, to);
  };
  const { ghost, over, scroller, cardProps, columnRef, dragging } = useCardDrag(onDrop);

  async function applyDayOff() {
    if (!ask?.s.branchId) return;
    setSaving(true);
    const supabase = createClient();
    let error: string | null = null;
    const att = { staffMemberId: ask.s.id, branchId: whereOf(ask.s) ?? ask.s.branchId, dateKey: date };
    const ATTENDANCE = { punch_in: punchIn, punch_out: punchOut, start_break: startBreak, end_break: endBreak } as const;
    const DONE: Record<StaffAction, string> = {
      add: " has the day off.",
      remove: "'s day off was removed.",
      punch_in: " is punched in.",
      punch_out: " is punched out.",
      start_break: " is on break.",
      end_break: "'s break has ended.",
    };
    if (ask.action in ATTENDANCE) {
      ({ error } = await ATTENDANCE[ask.action as keyof typeof ATTENDANCE](supabase, att));
    } else if (ask.action === "add") {
      ({ error } = await upsertStaffOff(supabase, { staffMemberId: ask.s.id, branchId: ask.s.branchId, shiftDate: date, period: "full_day", source: "manual" }));
    } else {
      const res = await supabase.from("staff_shifts").delete().eq("staff_member_id", ask.s.id).eq("shift_date", date).eq("source", "manual");
      error = res.error?.message ?? null;
    }
    setSaving(false);
    const who = ask.s.name;
    setAsk(null);
    if (error) return setNotice(`Couldn't save: ${error}`);
    const done = DONE[ask.action];
    onChanged(`${who}${done}`);
  }
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
        label="Drag a staff card onto a branch to lend or move them — or onto a column to punch in, break, punch out or give a day off"
      />
      {ask && (
        <div role="alertdialog" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fbf3dc] px-4 py-3 text-sm text-ink ring-1 ring-[#efd9a6]">
          <span>{ask.question}</span>
          <span className="flex gap-2">
            <button onClick={() => setAsk(null)} disabled={saving} className="rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink/70">
              Cancel
            </button>
            <button onClick={applyDayOff} disabled={saving} className="flex items-center gap-1.5 rounded-full bg-coral px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark disabled:opacity-60">
              {saving && <Spinner />} {{ add: "Yes, day off", remove: "Yes, remove it", punch_in: "Yes, punch in", punch_out: "Yes, punch out", start_break: "Yes, start break", end_break: "Yes, end break" }[ask.action]}
            </button>
          </span>
        </div>
      )}
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
            <Lane key={lane.key} title={lane.label} hint={lane.hint} count={list.length} tone={TONE[lane.key]} empty="No one here" laneRef={columnRef(`lane:${lane.key}`)} highlight={dragged && over === `lane:${lane.key}` ? (planStaffDrop(ctx, dragged, whereOf(dragged), date, lane.key).ok ? "ok" : "no") : null}>
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
