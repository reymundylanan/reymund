"use client";

import { AlertTriangle, ArrowLeftRight, CalendarClock, ChevronDown, ChevronRight, Clock, GripVertical, MapPin, Plane, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import {
  branchHours,
  formatDay,
  formatTime,
  isBranchActive,
  offFor,
  presence,
  staffStatus,
  toMinutes,
  type Appointment,
  type Branch,
  type Context,
  type Staff,
} from "@/lib/multiBranch/engine";
import { Avatar, Badge, STAFF_STATUS, TONE, type Tone } from "./ui";
import type { WalkinTransferItem } from "@/lib/multiBranch/walkinServer";
import type { DragItem } from "./useCardDrag";

export type ColumnStats = {
  availableStaff: number;
  working: number;
  openSlots: number;
  appointments: number;
  conflicts: number;
  /** Staff lent in + walk-ins sent here (that day). */
  incoming: number;
  /** Staff lent out + walk-ins sent elsewhere (that day). */
  outgoing: number;
};

type CardProps = (item: DragItem, enabled?: boolean) => Record<string, unknown>;

export const MOVABLE = (a: Appointment) =>
  (a.status === "pending" || a.status === "confirmed") &&
  !["arrived", "waiting", "ready", "late_arrival", "in_service", "completed", "paid", "no_show"].includes(a.sessionStatus ?? "");

export function appointmentTone(a: Appointment, conflict: boolean): { tone: Tone; label: string } {
  if (conflict) return { tone: "red", label: "Needs rescheduling" };
  if (a.sessionStatus === "no_show") return { tone: "gray", label: "No-show" };
  if (a.sessionStatus === "completed" || a.sessionStatus === "paid") return { tone: "green", label: "Done" };
  if (a.sessionStatus === "in_service") return { tone: "blue", label: "In service" };
  if (a.sessionStatus && ["arrived", "waiting", "ready", "late_arrival"].includes(a.sessionStatus)) return { tone: "blue", label: "Arrived" };
  if (a.status === "pending") return { tone: "amber", label: "Pending" };
  return { tone: "blue", label: "Confirmed" };
}

export function StaffCard({
  ctx,
  staff,
  branchId,
  date,
  bookings,
  dragProps,
  dimmed,
  onMove,
}: {
  ctx: Context;
  staff: Staff;
  branchId: string;
  date: string;
  bookings: number;
  dragProps?: Record<string, unknown>;
  dimmed?: boolean;
  onMove?: () => void;
}) {
  const status = STAFF_STATUS[staffStatus(ctx, staff.id, branchId, date)];
  const guest = presence(ctx, staff.id, branchId, date) === "guest";
  const homeName = guest ? ctx.branches.find((b) => b.id === staff.branchId)?.name : null;
  const lentTo = !guest ? ctx.lends.find((l) => l.staffId === staff.id && l.dates.includes(date)) : null;
  return (
    <li
      {...dragProps}
      className={`group relative flex select-none items-center gap-2.5 rounded-xl border bg-white p-2.5 transition ${
        dragProps ? "cursor-grab active:cursor-grabbing" : ""
      } ${dimmed ? "opacity-30" : "hover:border-coral/50 hover:shadow-sm"} border-ink/10`}
    >
      <span className={`absolute inset-y-2 left-0 w-1 rounded-full ${TONE[status.tone].dot}`} aria-hidden />
      {dragProps && (
        <span data-grip className="-my-2 -ml-1 touch-none py-2 pl-1 text-ink/25 group-hover:text-ink/45" aria-hidden>
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <Avatar name={staff.name} url={staff.avatarUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{staff.name}</span>
        <span className="flex flex-wrap items-center gap-1 text-xs text-ink/50">
          {staff.department || "—"} · {workingHours(ctx, staff.id, branchId, date)}
          {bookings > 0 && <span>· {bookings} booking{bookings === 1 ? "" : "s"}</span>}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          <Badge tone={status.tone}>{status.label}</Badge>
          {guest && (
            <Badge tone="blue">
              <Plane className="h-2.5 w-2.5" /> From {homeName ?? "another branch"}
            </Badge>
          )}
          {lentTo && (
            <Badge tone="amber">
              <Plane className="h-2.5 w-2.5" /> At {ctx.branches.find((b) => b.id === lentTo.branchId)?.name}
            </Badge>
          )}
        </span>
      </span>
      {onMove && (
        <button
          onClick={onMove}
          aria-label={`Move ${staff.name}`}
          title="Move staff"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/40 hover:bg-blush hover:text-coral-dark"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

export function AppointmentCard({
  ctx,
  appt,
  conflict,
  dragProps,
  dimmed,
  showDate,
  onReschedule,
}: {
  ctx: Context;
  appt: Appointment;
  conflict?: string | null;
  dragProps?: Record<string, unknown>;
  dimmed?: boolean;
  showDate?: boolean;
  onReschedule?: () => void;
}) {
  const { tone, label } = appointmentTone(appt, !!conflict);
  const staff = ctx.staff.find((s) => s.id === appt.professionalId);
  const start = toMinutes(appt.start);
  return (
    <li
      {...dragProps}
      className={`group relative select-none rounded-xl border bg-white p-2.5 transition ${dragProps ? "cursor-grab active:cursor-grabbing" : ""} ${
        dimmed ? "opacity-30" : "hover:border-coral/50 hover:shadow-sm"
      } ${conflict ? "border-red-300 bg-red-50/40" : "border-ink/10"}`}
    >
      <div className="flex items-start gap-2">
        {dragProps && (
          <span data-grip className="-my-2 -ml-1 touch-none py-2 pl-1 text-ink/25 group-hover:text-ink/45" aria-hidden>
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-xs font-semibold text-ink/70">
            <Clock className="h-3 w-3" />
            {showDate && <span>{formatDay(appt.date, ctx.today)} ·</span>}
            {formatTime(start)}–{formatTime(start + appt.duration)}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-ink">{appt.clientName}</p>
          <p className="truncate text-xs text-ink/55">{appt.serviceLabel}</p>
          <p className="truncate text-xs text-ink/45">
            {staff ? `with ${staff.name}` : "Any available staff"}
            {appt.code && ` · #${appt.code}`}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone={tone}>{label}</Badge>
            {appt.visitType === "walk_in" && <Badge tone="gray">Walk-in</Badge>}
            {appt.paid && (
              <Badge tone="gray">
                <Wallet className="h-2.5 w-2.5" /> Paid
              </Badge>
            )}
          </div>
          {conflict && (
            <p className="mt-1.5 flex items-start gap-1 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {conflict}
            </p>
          )}
        </div>
        {onReschedule && (
          <button
            onClick={onReschedule}
            aria-label={`Move or reschedule ${appt.clientName}'s appointment`}
            title="Move / reschedule"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/40 hover:bg-blush hover:text-coral-dark"
          >
            <CalendarClock className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

export function BranchColumn({
  ctx,
  branch,
  date,
  stats,
  staff,
  appointments,
  conflicts,
  collapsed,
  onToggle,
  columnRef,
  overTone,
  overText,
  dragging,
  cardProps,
  onMoveStaff,
  onMoveAppointment,
  walkins = [],
}: {
  ctx: Context;
  branch: Branch;
  date: string;
  stats: ColumnStats;
  staff: Staff[];
  appointments: Appointment[];
  conflicts: Map<string, string>;
  collapsed: boolean;
  onToggle: () => void;
  columnRef: (el: HTMLElement | null) => void;
  overTone: Tone | null;
  overText: string | null;
  dragging: DragItem | null;
  cardProps: CardProps;
  onMoveStaff: (s: Staff) => void;
  onMoveAppointment: (a: Appointment) => void;
  walkins?: WalkinTransferItem[];
}) {
  const active = isBranchActive(branch);
  const bookingsOf = (id: string) => ctx.appointments.filter((a) => a.professionalId === id && a.date === date).length;
  return (
    <section
      ref={columnRef}
      aria-label={branch.name}
      className={`flex shrink-0 snap-start flex-col rounded-2xl border-2 p-3 transition ${collapsed ? "w-[4.5rem]" : "w-[18.5rem] sm:w-[19.5rem]"} ${
        overTone ? `${TONE[overTone].ring} ${TONE[overTone].soft} shadow-lg` : "border-transparent bg-white shadow-sm"
      }`}
    >
      <header className="px-1">
        <div className="flex items-start gap-2">
          <button
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${branch.name}` : `Collapse ${branch.name}`}
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose text-coral-dark hover:bg-champagne"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate font-semibold text-ink">{branch.name}</h2>
                <Badge tone={active ? "green" : "red"}>{active ? "Open" : branch.status ?? "Closed"}</Badge>
              </div>
              {branch.address && (
                <p className="flex items-start gap-1 text-xs text-ink/45" title={branch.address}>
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-1">{branch.address}</span>
                </p>
              )}
              <p className="flex items-center gap-1 text-xs text-ink/45">
                <Clock className="h-3 w-3" /> {branch.hours ?? "Hours not set"}
              </p>
            </div>
          )}
        </div>
        {collapsed ? (
          <div className="mt-3 flex flex-col items-center gap-2 text-center">
            <p className="text-xs font-semibold text-ink [writing-mode:vertical-rl]">{branch.name}</p>
            <Badge tone="green">{stats.availableStaff}</Badge>
            {stats.conflicts > 0 && <Badge tone="red">{stats.conflicts}</Badge>}
          </div>
        ) : (
          <dl className="mt-3 grid grid-cols-5 gap-1 text-center">
            <Stat label="Avail. staff" value={stats.availableStaff} tone="green" />
            <Stat label={date === ctx.today ? "Working" : "Booked staff"} value={stats.working} tone="blue" />
            <Stat label="Open slots" value={stats.openSlots} tone="green" />
            <Stat label="Appts" value={stats.appointments} tone="gray" />
            <Stat label="Conflicts" value={stats.conflicts} tone={stats.conflicts ? "red" : "gray"} />
          </dl>
        )}
        {!collapsed && (stats.incoming > 0 || stats.outgoing > 0) && (
          <p className="mt-1.5 flex justify-center gap-3 text-[11px] font-semibold">
            <span className="text-blue-700">↘ {stats.incoming} incoming</span>
            <span className="text-amber-700">↗ {stats.outgoing} outgoing</span>
          </p>
        )}
      </header>

      {!collapsed && (
        <>
          {overText && (
            <p className={`mt-3 rounded-lg px-2 py-1.5 text-xs font-semibold ${TONE[overTone ?? "gray"].badge}`}>{overText}</p>
          )}
          <Section title={`Staff · ${staff.length}`}>
            {staff.map((s) => (
              <StaffCard
                key={s.id}
                ctx={ctx}
                staff={s}
                branchId={branch.id}
                date={date}
                bookings={bookingsOf(s.id)}
                dragProps={cardProps({ kind: "staff", id: s.id }, presence(ctx, s.id, branch.id, date) === "home")}
                dimmed={dragging?.kind === "staff" && dragging.id === s.id}
                onMove={() => onMoveStaff(s)}
              />
            ))}
            {staff.length === 0 && <Empty>No staff match</Empty>}
          </Section>
          <Section title={`Appointments · ${appointments.length}`}>
            {appointments.map((a) => (
              <AppointmentCard
                key={a.id}
                ctx={ctx}
                appt={a}
                conflict={conflicts.get(a.id)}
                dragProps={cardProps({ kind: "appointment", id: a.id }, MOVABLE(a))}
                dimmed={dragging?.kind === "appointment" && dragging.id === a.id}
                onReschedule={MOVABLE(a) ? () => onMoveAppointment(a) : undefined}
              />
            ))}
            {appointments.length === 0 && <Empty>No appointments this day</Empty>}
          </Section>
          {walkins.length > 0 && (
            <Section title={`Walk-in transfers · ${walkins.length}`}>
              {walkins.map((w) => (
                <WalkinTransferCard key={w.id} ctx={ctx} item={w} />
              ))}
            </Section>
          )}
        </>
      )}
    </section>
  );
}

/** "8:00 AM–7:00 PM", "From 1:00 PM" (morning off), "Day off"… */
function workingHours(ctx: Context, staffId: string, branchId: string, date: string) {
  const { open, close } = branchHours(ctx, branchId);
  const off = offFor(ctx, staffId, branchId, date);
  if (off?.period === "full_day") return off.source === "transfer" ? "lent out" : "off";
  if (off?.period === "morning") return `from ${formatTime(Math.max(open, 13 * 60))}`;
  if (off?.period === "afternoon") return `until ${formatTime(Math.min(close, 13 * 60))}`;
  return `${formatTime(open)}–${formatTime(close)}`;
}

const WALKIN_TONE: Record<WalkinTransferItem["state"]["tone"], Tone> = { green: "green", blue: "blue", amber: "amber", red: "red", gray: "gray", purple: "purple" };

/** A walk-in sent from one branch to another (or still looking for a place). */
export function WalkinTransferCard({ ctx, item: w }: { ctx: Context; item: WalkinTransferItem }) {
  const time = w.proposed_time ? formatTime(w.proposed_time.slice(0, 5)) : null;
  return (
    <li className="rounded-xl border border-[#E8D5A5] bg-[#FFFBF0] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-ink">{w.walkin_name}</p>
        <Badge tone={WALKIN_TONE[w.state.tone]}>{w.state.label}</Badge>
      </div>
      <p className="truncate text-xs text-ink/60">{w.services.map((s) => s.name).filter(Boolean).join(", ")}</p>
      <p className="text-xs text-ink/55">
        {w.originName} → {w.destName ?? "looking for a branch"}
        {w.proposed_date && ` · ${formatDay(w.proposed_date, ctx.today)}${time ? ` ${time}` : ""}`}
      </p>
      <p className="text-[11px] text-ink/45">
        {w.staffName ? `with ${w.staffName} · ` : ""}
        {w.status === "confirmed" ? "client approved" : w.status === "awaiting_approval" ? "waiting for the client's answer" : w.status === "waiting_availability" ? "no branch free yet" : "cancelled"}
        {w.bookingCode ? ` · #${w.bookingCode}` : ""}
      </p>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={`rounded-lg px-0.5 py-1 ${TONE[tone].soft}`}>
      <dd className={`text-sm font-bold ${tone === "gray" ? "text-ink" : TONE[tone].badge.split(" ")[1]}`}>{value}</dd>
      <dt className="text-[9px] font-medium uppercase leading-tight tracking-wide text-ink/45">{label}</dt>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink/45">{title}</h3>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <li className="rounded-xl border-2 border-dashed border-ink/10 px-3 py-4 text-center text-xs text-ink/35">{children}</li>;
}
