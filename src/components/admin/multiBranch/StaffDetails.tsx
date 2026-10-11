"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Phone, Star } from "lucide-react";
import {
  addDays,
  branchHours,
  formatDay,
  formatTime,
  offFor,
  presence,
  staffStatus,
  toMinutes,
  type Appointment,
  type Context,
  type Staff,
} from "@/lib/multiBranch/engine";
import { Avatar, Badge, DetailDrawer, DetailRows, DetailSection, STAFF_STATUS, Spinner } from "./ui";
import { appointmentTone } from "./BoardColumn";

type Extra = {
  phone: string | null;
  shiftType: string | null;
  since: string | null;
  rating: { average: number; count: number };
  recent: { rating: number; text: string | null; date: string; by: string | null }[];
};

const SHIFT: Record<string, string> = { opener: "Opener", midshift: "Mid-shift", closer: "Closer" };

/** One staff member: who they are, where they work and when, their bookings and reviews. */
export function StaffDetails({
  ctx,
  staff: s,
  branchId,
  date,
  onClose,
  onMove,
}: {
  ctx: Context;
  staff: Staff;
  /** The column it was opened from (home or lent-in branch). */
  branchId: string;
  date: string;
  onClose: () => void;
  onMove: () => void;
}) {
  const [extra, setExtra] = useState<Extra | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/multi-branch/staff?id=${s.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Extra | null) => alive && setExtra(j))
      .catch(() => alive && setExtra(null));
    return () => {
      alive = false;
    };
  }, [s.id]);

  const branchName = (id: string | null) => ctx.branches.find((b) => b.id === id)?.name ?? "No branch";
  const status = STAFF_STATUS[staffStatus(ctx, s.id, branchId, date)];
  const guest = presence(ctx, s.id, branchId, date) === "guest";
  const { open, close } = branchHours(ctx, branchId);
  const off = offFor(ctx, s.id, branchId, date);
  const hours =
    off?.period === "full_day" ? (off.source === "transfer" ? "Lent to another branch" : off.source === "leave" ? "On leave" : "Day off")
    : off?.period === "morning" ? `${formatTime(Math.max(open, 13 * 60))}–${formatTime(close)} (morning off)`
    : off?.period === "afternoon" ? `${formatTime(open)}–${formatTime(Math.min(close, 13 * 60))} (afternoon off)`
    : `${formatTime(open)}–${formatTime(close)}`;

  const dayBookings = ctx.appointments
    .filter((a) => a.professionalId === s.id && a.date === date)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const bookedMinutes = dayBookings.reduce((n, a) => n + a.duration, 0);

  // Days off, leave and lending over the next two weeks.
  const schedule: { date: string; text: string; tone: "red" | "amber" | "blue" }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(ctx.today, i);
    const o = ctx.offs.find((x) => x.staffId === s.id && x.date === d);
    const lentIn = ctx.lends.find((l) => l.staffId === s.id && l.dates.includes(d));
    if (lentIn) schedule.push({ date: d, text: `At ${branchName(lentIn.branchId)}`, tone: "blue" });
    else if (o) schedule.push({ date: d, text: o.source === "leave" ? "Leave" : o.period === "full_day" ? "Day off" : o.period === "morning" ? "Morning off" : "Afternoon off", tone: o.source === "leave" ? "amber" : "red" });
  }

  return (
    <DetailDrawer
      title={s.name}
      subtitle={
        <>
          {s.department || "—"} · {branchName(branchId)} <Badge tone={status.tone}>{status.label}</Badge>
        </>
      }
      onClose={onClose}
    >
      <div className="flex items-center gap-3">
        <Avatar name={s.name} url={s.avatarUrl} size={64} />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{s.name}</p>
          {extra && extra.rating.count > 0 ? (
            <p className="flex items-center gap-1 text-sm text-ink/70">
              <Star className="h-4 w-4 fill-[#c9a24a] text-[#c9a24a]" /> {extra.rating.average} · {extra.rating.count} review{extra.rating.count === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="text-sm text-ink/45">{extra ? "No reviews yet" : "Loading…"}</p>
          )}
          {guest && <Badge tone="blue">Visiting from {branchName(s.branchId)}</Badge>}
        </div>
      </div>

      <DetailRows
        rows={[
          ["Department", s.department || "—"],
          ["Home branch", branchName(s.branchId)],
          [`Hours · ${formatDay(date, ctx.today)}`, hours],
          ["Shift", extra?.shiftType ? SHIFT[extra.shiftType] ?? extra.shiftType : "—"],
          ["Phone", extra?.phone ? <a href={`tel:${extra.phone}`} className="inline-flex items-center gap-1 text-coral-dark hover:underline"><Phone className="h-3.5 w-3.5" />{extra.phone}</a> : "—"],
          ["Staff since", extra?.since ? new Date(extra.since).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"],
        ]}
      />

      <DetailSection label={`Bookings · ${formatDay(date, ctx.today)} · ${dayBookings.length}${bookedMinutes ? ` (${Math.round((bookedMinutes / 60) * 10) / 10} h)` : ""}`}>
        {dayBookings.length ? (
          <ul className="space-y-1.5">
            {dayBookings.map((a) => {
              const t = appointmentTone(a, false);
              return (
                <li key={a.id} className="rounded-lg bg-cream/60 px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {formatTime(toMinutes(a.start))}–{formatTime(toMinutes(a.start) + a.duration)} · {a.clientName}
                    </span>
                    <Badge tone={t.tone}>{t.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-ink/60">{a.serviceLabel}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="text-ink/45">No bookings that day.</span>
        )}
      </DetailSection>

      <DetailSection label="Next two weeks">
        {schedule.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {schedule.map((x) => (
              <li key={x.date}>
                <Badge tone={x.tone}>
                  {formatDay(x.date, ctx.today)} · {x.text}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-ink/45">Working every day — no days off, leave or lending.</span>
        )}
      </DetailSection>

      <DetailSection label="Recent reviews">
        {!extra ? (
          <span className="flex items-center gap-2 text-ink/45"><Spinner /> Loading…</span>
        ) : extra.recent.length ? (
          <ul className="space-y-1.5">
            {extra.recent.map((r, i) => (
              <li key={i} className="rounded-lg bg-cream/60 px-2.5 py-2 text-xs">
                <p className="font-semibold text-[#a97c1c]">{"★".repeat(r.rating)}<span className="text-ink/20">{"★".repeat(5 - r.rating)}</span></p>
                <p className="mt-0.5 text-ink/75">&ldquo;{r.text}&rdquo;</p>
                <p className="text-ink/40">{r.by ?? "Client"} · {new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-ink/45">No written reviews yet.</span>
        )}
      </DetailSection>

      {!guest && (
        <button onClick={onMove} className="w-full rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
          Transfer to another branch
        </button>
      )}
    </DetailDrawer>
  );
}

/** One appointment: client, services, time, staff and what's wrong (if anything). */
export function AppointmentDetails({
  ctx,
  appt: a,
  conflict,
  movable,
  onClose,
  onReschedule,
}: {
  ctx: Context;
  appt: Appointment;
  conflict: string | null;
  movable: boolean;
  onClose: () => void;
  onReschedule: () => void;
}) {
  const t = appointmentTone(a, !!conflict);
  const staff = ctx.staff.find((s) => s.id === a.professionalId);
  const branch = ctx.branches.find((b) => b.id === a.branchId);
  const start = toMinutes(a.start);
  return (
    <DetailDrawer
      title={a.clientName}
      subtitle={
        <>
          {a.visitType === "walk_in" ? "Walk-in" : "Booking"}
          {a.code ? ` · #${a.code}` : ""} <Badge tone={t.tone}>{t.label}</Badge>
        </>
      }
      onClose={onClose}
    >
      {conflict && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"><b>Can&apos;t go ahead as booked:</b> {conflict}</p>}
      <DetailSection label="Services">{a.serviceLabel}</DetailSection>
      <DetailRows
        rows={[
          ["When", `${formatDay(a.date, ctx.today)} · ${formatTime(start)}–${formatTime(start + a.duration)}`],
          ["Duration", `${a.duration} min`],
          ["Branch", branch?.name ?? "—"],
          ["Staff", staff ? `${staff.name} (${staff.department || "—"})` : "Any available"],
          ["Status", a.sessionStatus ? `${a.status} · ${a.sessionStatus.replace(/_/g, " ")}` : a.status],
          ["Payment", a.paid ? "Paid / deposit on record" : "Not paid yet"],
          ["Client", a.clientId ? "Has an account" : "Walk-in (no account)"],
        ]}
      />
      {movable ? (
        <button onClick={onReschedule} className="flex w-full items-center justify-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
          <CalendarClock className="h-4 w-4" /> Move / reschedule
        </button>
      ) : (
        <p className="text-xs text-ink/45">Already started or finished — it can&apos;t be moved.</p>
      )}
    </DetailDrawer>
  );
}
