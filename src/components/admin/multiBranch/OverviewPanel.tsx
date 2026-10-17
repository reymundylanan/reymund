"use client";

import { AlertTriangle, ArrowRight, CalendarCheck, CircleCheck, Clock, Footprints, Hourglass, MapPin, UserCheck } from "lucide-react";
import { branchHours, formatTime, isBranchActive, staffStatus, type Context } from "@/lib/multiBranch/engine";

export type Tab = "overview" | "staff" | "clients" | "services" | "appointments" | "walkins" | "transfers";

/** The first thing the Admin sees: what needs doing, and each branch at a glance. */
export default function OverviewPanel({
  ctx,
  date,
  branchId,
  needs,
  pendingStaffTransfers,
  pendingWalkinTransfers,
  onGo,
}: {
  ctx: Context;
  date: string;
  branchId: string;
  needs: number;
  pendingStaffTransfers: number;
  pendingWalkinTransfers: number;
  onGo: (tab: Tab) => void;
}) {
  const inBranch = (id: string) => branchId === "all" || id === branchId;
  const appts = ctx.appointments.filter((a) => a.date === date && inBranch(a.branchId));
  const pending = ctx.appointments.filter((a) => a.status === "pending" && a.date >= ctx.today && inBranch(a.branchId)).length;

  const todo = [
    { show: needs > 0, icon: AlertTriangle, tone: "bg-[#F6E3E3] text-[#9A5257]", text: `${needs} booking${needs === 1 ? " needs" : "s need"} a new time or branch`, tab: "transfers" as Tab, cta: "Resolve" },
    { show: pending > 0, icon: Hourglass, tone: "bg-[#F6ECD2] text-[#8A6A1C]", text: `${pending} booking${pending === 1 ? " is" : "s are"} waiting for confirmation`, tab: "appointments" as Tab, cta: "Confirm" },
    { show: pendingWalkinTransfers > 0, icon: Footprints, tone: "bg-[#F9E8D9] text-[#94602F]", text: `${pendingWalkinTransfers} walk-in transfer${pendingWalkinTransfers === 1 ? " is" : "s are"} waiting`, tab: "transfers" as Tab, cta: "Review" },
    { show: pendingStaffTransfers > 0, icon: UserCheck, tone: "bg-[#efe8f4] text-[#6E5A8C]", text: `${pendingStaffTransfers} staff transfer request${pendingStaffTransfers === 1 ? "" : "s"} to approve`, tab: "transfers" as Tab, cta: "Review" },
  ].filter((t) => t.show);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <section className="rounded-3xl bg-white p-5 shadow-[0_14px_34px_-26px_rgba(90,60,20,0.55)] ring-1 ring-[#efe3c6]">
        <h2 className="text-base font-semibold text-ink">Needs attention</h2>
        <p className="text-xs text-ink/50">Everything that&apos;s waiting on you, with a shortcut to fix it.</p>
        {todo.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-[#E6EDE2] px-4 py-5 text-sm font-medium text-[#4F6B4A]">
            <CircleCheck className="h-5 w-5" /> All clear — nothing is waiting.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {todo.map(({ icon: I, tone, text, tab, cta }) => (
              <li key={text} className="flex items-center gap-3 rounded-2xl border border-[#f1e4c4] p-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><I className="h-4 w-4" /></span>
                <span className="flex-1 text-sm text-ink/80">{text}</span>
                <button onClick={() => onGo(tab)} className="flex items-center gap-1 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark">
                  {cta} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-[0_14px_34px_-26px_rgba(90,60,20,0.55)] ring-1 ring-[#efe3c6]">
        <h2 className="text-base font-semibold text-ink">Branches {date === ctx.today ? "today" : "on this day"}</h2>
        <p className="text-xs text-ink/50">Open a board to manage the details.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {ctx.branches.filter((b) => inBranch(b.id)).map((b) => {
            const { open, close } = branchHours(ctx, b.id);
            const openNow = isBranchActive(b) && date === ctx.today && ctx.nowMinutes >= open && ctx.nowMinutes < close;
            const here = appts.filter((a) => a.branchId === b.id);
            const bookings = here.filter((a) => a.visitType !== "walk_in").length;
            const walkins = here.filter((a) => a.visitType === "walk_in").length;
            const staff = ctx.staff.filter((s) => (ctx.lends.find((l) => l.staffId === s.id && l.dates.includes(date))?.branchId ?? s.branchId) === b.id);
            const free = staff.filter((s) => ["available", "scheduled", "partial_off"].includes(staffStatus(ctx, s.id, b.id, date))).length;
            return (
              <div key={b.id} className="rounded-2xl bg-gradient-to-br from-white to-[#fbf4e4] p-4 ring-1 ring-[#efe3c6]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{b.name}</p>
                    <p className="flex items-center gap-1 text-[11px] text-ink/55"><Clock className="h-3 w-3" /> {formatTime(open)} – {formatTime(close)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${!isBranchActive(b) ? "bg-[#F6E3E3] text-[#9A5257]" : openNow ? "bg-[#E6EDE2] text-[#4F6B4A]" : "bg-ink/5 text-ink/55"}`}>
                    {!isBranchActive(b) ? "Not open for bookings" : date !== ctx.today ? "Open that day" : openNow ? "Open now" : "Closed now"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      [bookings, "Bookings", CalendarCheck, "appointments"],
                      [walkins, "Walk-ins", Footprints, "walkins"],
                      [`${free}/${staff.length}`, "Staff free", UserCheck, "staff"],
                    ] as const
                  ).map(([n, label, I, tab]) => (
                    <button key={label} onClick={() => onGo(tab)} className="rounded-xl bg-white/80 py-2 ring-1 ring-[#f1e4c4] transition hover:ring-coral">
                      <I className="mx-auto h-4 w-4 text-coral-dark" />
                      <p className="mt-0.5 text-lg font-semibold leading-none text-ink">{n}</p>
                      <p className="mt-0.5 text-[10px] text-ink/55">{label}</p>
                    </button>
                  ))}
                </div>
                {b.address && <p className="mt-2 flex items-start gap-1 text-[11px] text-ink/45"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /> <span className="line-clamp-1">{b.address}</span></p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
