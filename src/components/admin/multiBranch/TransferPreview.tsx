"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Bell, CalendarClock, MapPin, Plane, RefreshCw, Wallet, X } from "lucide-react";
import {
  addDays,
  branchHours,
  candidateStaff,
  formatDay,
  formatTime,
  isBranchActive,
  openSlotCount,
  openStarts,
  presence,
  staffStatus,
  toMinutes,
  toTime,
  type Appointment,
  type CheckResult,
  type Context,
  type Staff,
  type Suggestion,
} from "@/lib/multiBranch/engine";
import type { Channels } from "@/lib/multiBranch/channels";
import { Avatar, CheckRow, Spinner, postJson } from "./ui";
import { AppointmentCard } from "./BoardColumn";

export type Done = (message: string, logId: string | null) => void;

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-[80] overflow-y-auto bg-white p-5 lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:rounded-2xl lg:border lg:border-coral/30 lg:shadow-lg"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-coral-dark">Transfer preview</p>
          <h2 className="font-semibold text-ink">{title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close preview" className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </aside>
  );
}

function Side({ label, tone, children }: { label: string; tone: "old" | "new"; children: ReactNode }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${tone === "new" ? "border-coral/50 bg-blush" : "border-ink/10 bg-cream/60"}`}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink/45">{label}</p>
      <div className="space-y-0.5 text-sm text-ink">{children}</div>
    </div>
  );
}

// ── Appointment move / reschedule ─────────────────────────────────────

type ApptPreview = { appointment: Appointment; proposal: CheckResult | null; suggestions: Suggestion[]; channels: Channels };
type Pick = { branchId: string; staffId: string | null; date: string; start: number };

export function AppointmentPreview({
  ctx,
  appt,
  conflict,
  initialBranchId,
  onClose,
  onDone,
}: {
  ctx: Context;
  appt: Appointment;
  conflict: string | null;
  initialBranchId: string | null;
  onClose: () => void;
  onDone: Done;
}) {
  const [scope, setScope] = useState<string | null>(initialBranchId);
  const [data, setData] = useState<ApptPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<Pick | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState(false);
  const [reason, setReason] = useState(conflict ?? "");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchName = (id: string) => ctx.branches.find((b) => b.id === id)?.name ?? "—";
  const staffName = (id: string | null) => (id ? ctx.staff.find((s) => s.id === id)?.name ?? "—" : "Any available");

  const loadSuggestions = useCallback(
    async (branchId: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const res = await postJson<ApptPreview>("/api/admin/multi-branch/preview", { type: "appointment", appointmentId: appt.id, branchId: branchId ?? undefined });
        setData(res);
      } catch (e) {
        setError((e as Error).message);
      }
      setLoading(false);
    },
    [appt.id]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches suggestions for the chosen scope
    loadSuggestions(scope);
  }, [scope, loadSuggestions]);

  // Every change of the proposed slot is validated on the server.
  const seq = useRef(0);
  useEffect(() => {
    if (!pick) return;
    const n = ++seq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- validation request for the new pick
    setChecking(true);
    postJson<ApptPreview>("/api/admin/multi-branch/preview", {
      type: "appointment",
      appointmentId: appt.id,
      branchId: pick.branchId,
      staffId: pick.staffId,
      date: pick.date,
      start: toTime(pick.start),
    })
      .then((res) => n === seq.current && setCheck(res.proposal))
      .catch((e) => n === seq.current && setError((e as Error).message))
      .finally(() => n === seq.current && setChecking(false));
  }, [pick, appt.id]);

  async function confirm() {
    if (!pick) return;
    setSaving(true);
    setError(null);
    try {
      const res = await postJson<{ logId: string }>("/api/admin/multi-branch/move-appointment", {
        appointmentId: appt.id,
        branchId: pick.branchId,
        staffId: pick.staffId,
        date: pick.date,
        start: toTime(pick.start),
        reason,
      });
      onDone(`${appt.clientName}'s appointment moved to ${branchName(pick.branchId)}, ${formatDay(pick.date, ctx.today)} ${formatTime(pick.start)}.`, res.logId);
    } catch (e) {
      const err = e as Error & { data?: { suggestions?: Suggestion[] } };
      setError(err.message);
      // The slot was taken meanwhile (or another rule failed): fresh options.
      if (err.data?.suggestions) setData((d) => (d ? { ...d, suggestions: err.data!.suggestions! } : d));
      setPick(null);
      setCheck(null);
      setConfirming(false);
    }
    setSaving(false);
  }

  const start = toMinutes(appt.start);
  const destBranch = pick ? ctx.branches.find((b) => b.id === pick.branchId) : null;
  const canConfirm = !!pick && !!check?.ok && !checking && reason.trim().length > 0;

  return (
    <Panel title={`Move ${appt.clientName}'s appointment`} onClose={onClose}>
      {conflict && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span><b>Why it can&apos;t go ahead:</b> {conflict}</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Side label="Original" tone="old">
          <p className="font-semibold">{branchName(appt.branchId)}</p>
          <p>{formatDay(appt.date, ctx.today)} · {formatTime(start)}–{formatTime(start + appt.duration)}</p>
          <p className="text-ink/60">{staffName(appt.professionalId)}</p>
          <p className="text-ink/60">{appt.serviceLabel} · {appt.duration} min</p>
          {appt.code && <p className="text-xs text-ink/45">#{appt.code} · {appt.status}</p>}
        </Side>
        <Side label="Proposed" tone="new">
          {pick ? (
            <>
              <p className="font-semibold">{branchName(pick.branchId)}</p>
              {destBranch?.address && pick.branchId !== appt.branchId && (
                <p className="flex items-start gap-1 text-xs text-ink/60">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {destBranch.address}
                </p>
              )}
              <p>{formatDay(pick.date, ctx.today)} · {formatTime(pick.start)}–{formatTime(pick.start + appt.duration)}</p>
              <p className="text-ink/60">{staffName(pick.staffId)}</p>
              <p className="text-ink/60">Same service · {appt.duration} min (not shortened)</p>
            </>
          ) : (
            <p className="text-ink/50">Choose a suggestion below, or pick a slot yourself.</p>
          )}
        </Side>
      </div>

      {appt.paid && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink/55">
          <Wallet className="h-3.5 w-3.5" /> Its payment and balance stay with this booking — nothing is refunded or changed.
        </p>
      )}

      {/* Suggestions */}
      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">
            {scope ? `Open slots at ${branchName(scope)}` : "Valid alternatives"}
          </h3>
          <div className="flex gap-1.5">
            {scope && (
              <button onClick={() => setScope(null)} className="rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink/70 hover:border-coral">
                Choose another branch
              </button>
            )}
            <button onClick={() => setManual((m) => !m)} className="rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink/70 hover:border-coral">
              {manual ? "Hide picker" : "Choose another slot"}
            </button>
          </div>
        </div>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-ink/50"><Spinner /> Checking live availability…</p>
        ) : data && data.suggestions.length > 0 ? (
          <ul className="space-y-1.5">
            {data.suggestions.map((s) => {
              const chosen = pick && pick.branchId === s.branchId && pick.staffId === s.staffId && pick.date === s.date && pick.start === s.start;
              return (
                <li key={`${s.branchId}-${s.staffId}-${s.date}-${s.start}`}>
                  <button
                    onClick={() => {
                      setPick({ branchId: s.branchId, staffId: s.staffId, date: s.date, start: s.start });
                      setConfirming(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                      chosen ? "border-coral bg-blush" : "border-ink/10 hover:border-coral/60"
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${s.sameBranch ? "bg-green-500" : "bg-blue-500"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">
                        {branchName(s.branchId)} — {formatDay(s.date, ctx.today)} {formatTime(s.start)}
                      </span>
                      <span className="block text-xs text-ink/55">
                        {staffName(s.staffId)} · qualified and free for the full {appt.duration} min
                        {s.sameBranch && s.sameDay ? " · same branch, same day" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <p className="font-semibold">No valid slot found{scope ? ` at ${branchName(scope)} in the next 7 days` : " in the next 3 days"}.</p>
            <p className="mt-0.5 text-xs">
              Nothing is changed — the appointment stays as booked{conflict ? " and remains under Needs rescheduling" : ""}. Contact {appt.clientName}
              {appt.code ? ` (booking #${appt.code})` : ""} to agree on another schedule, or pick a later date with “Choose another slot”.
            </p>
          </div>
        )}
      </div>

      {manual && <ManualPicker ctx={ctx} appt={appt} onPick={(p) => { setPick(p); setConfirming(false); }} />}

      {/* Validation */}
      {pick && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            Validation {checking && <Spinner className="text-coral" />}
          </h3>
          {check && !checking && (
            <ul className="space-y-1.5">
              <CheckRow ok={check.checks.staffAvailable} label="Staff available" detail={!check.checks.staffAvailable ? check.reasons.find((r) => /off|punched|break|serving|work at/i.test(r)) : undefined} />
              <CheckRow ok={check.checks.qualified} label="Staff qualified for the service" />
              <CheckRow ok={check.checks.serviceAvailable} label="Service offered at this branch" />
              <CheckRow ok={check.checks.slotFree && check.checks.notPast} label="Time slot available (full duration)" />
              <CheckRow ok={check.checks.branchOpen && check.checks.withinHours} label="Branch open for the whole service" />
              <CheckRow ok={check.ok} label={check.ok ? "No conflicts detected" : "Conflicts detected"} detail={check.ok ? undefined : check.reasons.join(" ")} />
              <CheckRow ok na label="Rooms / equipment" detail="Not tracked in GlowSync — no resource check needed." />
            </ul>
          )}
        </div>
      )}

      {/* Notification + reason */}
      <div className="mt-4 space-y-3">
        <p className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2 text-xs text-ink/70">
          <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral-dark" />
          <span>
            <b>Client notification:</b> {data?.channels.summary ?? "…"} — sent only after you confirm, with the old and new schedule, the reason, and how to
            reach the salon.
          </span>
        </p>
        <label className="block">
          <span className="text-sm font-medium text-ink/70">Reason for the change *</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Angela is unavailable at 2:00 PM"
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-coral focus:outline-none"
          />
        </label>
      </div>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {confirming && pick ? (
        <div className="mt-4 rounded-xl border-2 border-coral bg-blush p-3">
          <p className="text-sm text-ink">
            Move <b>{appt.clientName}</b> to <b>{branchName(pick.branchId)}</b>, {formatDay(pick.date, ctx.today)} at {formatTime(pick.start)} with{" "}
            {staffName(pick.staffId)}? {appt.status === "confirmed" ? "This is a confirmed booking — " : ""}the client will be notified.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirming(false)} disabled={saving} className="flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink/70">
              Back
            </button>
            <button onClick={confirm} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving && <Spinner />} {saving ? "Re-checking & saving…" : "Yes, move it"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30">
            Cancel
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={!canConfirm}
            title={!pick ? "Choose a slot first" : !check?.ok ? "Every check must pass" : !reason.trim() ? "Add a reason" : undefined}
            className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm transfer
          </button>
        </div>
      )}
    </Panel>
  );
}

function ManualPicker({ ctx, appt, onPick }: { ctx: Context; appt: Appointment; onPick: (p: Pick) => void }) {
  const [branchId, setBranchId] = useState(appt.branchId);
  const [date, setDate] = useState(appt.date < ctx.today ? ctx.today : appt.date);
  const staff = useMemo(() => candidateStaff(ctx, branchId, date, appt.departments), [ctx, branchId, date, appt.departments]);
  const [staffId, setStaffId] = useState<string>("");
  const chosenStaff = staff.some((s) => s.id === staffId) ? staffId : staff[0]?.id ?? "";
  const starts = useMemo(
    () =>
      chosenStaff
        ? openStarts(ctx, { branchId, staffId: chosenStaff, date, duration: appt.duration, departments: appt.departments, services: branchId === appt.branchId ? [] : appt.services, excludeAppointmentId: appt.id })
        : [],
    [ctx, branchId, chosenStaff, date, appt]
  );
  const { open, close } = branchHours(ctx, branchId);
  const field = "mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm";
  return (
    <div className="mt-3 rounded-xl border border-ink/10 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-ink/60">
          Branch
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={field}>
            {ctx.branches.filter(isBranchActive).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink/60">
          Date
          <input type="date" value={date} min={ctx.today} max={addDays(ctx.today, 13)} onChange={(e) => e.target.value && setDate(e.target.value)} className={field} />
        </label>
        <label className="col-span-2 text-xs font-medium text-ink/60">
          Qualified staff
          <select value={chosenStaff} onChange={(e) => setStaffId(e.target.value)} className={field}>
            {staff.length === 0 && <option value="">No qualified staff that day</option>}
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.department}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-ink/50">
        Open times for the full {appt.duration} min ({formatTime(open)}–{formatTime(close)}):
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {starts.map((t) => (
          <button key={t} onClick={() => onPick({ branchId, staffId: chosenStaff, date, start: t })} className="rounded-full border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100">
            {formatTime(t)}
          </button>
        ))}
        {chosenStaff && starts.length === 0 && <span className="text-xs text-red-700">No open time for this person that day.</span>}
      </div>
    </div>
  );
}

// ── Staff transfer ────────────────────────────────────────────────────

type StaffCheck = { ok: boolean; items: { label: string; ok: boolean; detail?: string }[]; affected: Appointment[] };

export function StaffPreview({
  ctx,
  staff,
  initialToBranchId,
  date,
  onClose,
  onDone,
  onReschedule,
}: {
  ctx: Context;
  staff: Staff;
  initialToBranchId: string | null;
  date: string;
  onClose: () => void;
  onDone: Done;
  onReschedule: (a: Appointment) => void;
}) {
  const others = ctx.branches.filter((b) => b.id !== staff.branchId);
  const [toBranchId, setToBranchId] = useState(initialToBranchId ?? others[0]?.id ?? "");
  const [kind, setKind] = useState<"temporary" | "permanent">("temporary");
  const [dates, setDates] = useState<string[]>([date < ctx.today ? ctx.today : date]);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<StaffCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dest = ctx.branches.find((b) => b.id === toBranchId);
  const from = ctx.branches.find((b) => b.id === staff.branchId);
  const status = staffStatus(ctx, staff.id, staff.branchId ?? "", ctx.today);

  const seq = useRef(0);
  useEffect(() => {
    if (!toBranchId) return;
    const n = ++seq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- server validation for the new choice
    setChecking(true);
    postJson<StaffCheck>("/api/admin/multi-branch/preview", { type: "staff", staffId: staff.id, toBranchId, kind, dates })
      .then((r) => n === seq.current && setResult(r))
      .catch((e) => n === seq.current && setError((e as Error).message))
      .finally(() => n === seq.current && setChecking(false));
  }, [staff.id, toBranchId, kind, dates]);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const res = await postJson<{ logId: string }>("/api/admin/multi-branch/transfer-staff", { staffId: staff.id, toBranchId, kind, dates, reason });
      onDone(
        kind === "permanent"
          ? `${staff.name} now belongs to ${dest?.name}.`
          : `${staff.name} is lent to ${dest?.name} for ${dates.length} day${dates.length === 1 ? "" : "s"}.`,
        res.logId
      );
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    }
    setSaving(false);
  }

  const toggleDate = (d: string) =>
    setDates((cur) => (cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : cur.length >= 15 ? cur : [...cur, d].sort()));

  // What the destination looks like on the first chosen day.
  const firstDay = kind === "temporary" ? dates[0] : date < ctx.today ? ctx.today : date;
  const destStaff = dest ? ctx.staff.filter((s) => presence(ctx, s.id, dest.id, firstDay) && !["day_off", "lent_out"].includes(staffStatus(ctx, s.id, dest.id, firstDay))) : [];
  const sameDept = destStaff.filter((s) => s.department === staff.department).length;
  const destBookings = dest ? ctx.appointments.filter((a) => a.branchId === dest.id && a.date === firstDay).length : 0;
  const hours = dest ? branchHours(ctx, dest.id) : null;
  const canConfirm = !!result?.ok && !checking && (kind === "temporary" || reason.trim().length > 0);

  return (
    <Panel title={`Transfer ${staff.name}`} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar name={staff.name} url={staff.avatarUrl} size={44} />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{staff.name}</p>
          <p className="text-sm text-ink/55">{staff.department} · today: {status.replace("_", " ")}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side label="From" tone="old">
          <p className="font-semibold">{from?.name ?? "No branch"}</p>
        </Side>
        <ArrowRight className="h-4 w-4 text-coral-dark" />
        <Side label="To" tone="new">
          <select value={toBranchId} onChange={(e) => setToBranchId(e.target.value)} aria-label="Destination branch" className="w-full bg-transparent font-semibold outline-none">
            {others.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Side>
      </div>

      <div role="radiogroup" aria-label="Transfer type" className="mt-4 grid grid-cols-2 gap-2">
        {(
          [
            ["temporary", "Temporary", "Lend for chosen days; returns home automatically", Plane],
            ["permanent", "Permanent", "Change their home branch", RefreshCw],
          ] as const
        ).map(([k, label, hint, Icon]) => (
          <button
            key={k}
            role="radio"
            aria-checked={kind === k}
            onClick={() => { setKind(k); setConfirming(false); }}
            className={`rounded-xl border-2 p-2.5 text-left transition ${kind === k ? "border-coral bg-blush" : "border-ink/10 hover:border-coral/50"}`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Icon className="h-4 w-4 text-coral-dark" /> {label}</span>
            <span className="mt-0.5 block text-xs text-ink/55">{hint}</span>
          </button>
        ))}
      </div>

      {kind === "temporary" ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink/70">Dates ({dates.length}/15) · working time: full day{hours ? `, ${formatTime(hours.open)}–${formatTime(hours.close)}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Array.from({ length: 21 }, (_, i) => addDays(ctx.today, i)).map((d) => {
              const on = dates.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleDate(d)}
                  aria-pressed={on}
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${on ? "border-coral bg-coral text-white" : "border-ink/10 text-ink/70 hover:border-coral/50"}`}
                >
                  {formatDay(d, ctx.today)}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-ink/50">They return to {from?.name} automatically after the last day — nothing to undo by hand.</p>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Effective immediately. Their past appointments, attendance and payments stay recorded under {from?.name ?? "their old branch"}.
        </p>
      )}

      {dest && (
        <div className="mt-4 rounded-xl bg-cream px-3 py-2 text-xs text-ink/70">
          <p className="font-semibold text-ink">{dest.name} on {formatDay(firstDay, ctx.today)}</p>
          <p>
            {sameDept} other {staff.department || "same-department"} staff working · {destStaff.length} staff in all · {destBookings} booking{destBookings === 1 ? "" : "s"} ·{" "}
            {openSlotCount(ctx, dest.id, firstDay)} open 1-hr slots
          </p>
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">Validation {checking && <Spinner className="text-coral" />}</h3>
        {result && !checking && (
          <ul className="space-y-1.5">
            {result.items.map((i) => (
              <CheckRow key={i.label} ok={i.ok} label={i.label} detail={i.detail} />
            ))}
          </ul>
        )}
      </div>

      {result && result.affected.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Affected appointments</h3>
          <ul className="space-y-2">
            {result.affected.map((a) => (
              <AppointmentCard key={a.id} ctx={ctx} appt={a} showDate onReschedule={() => onReschedule(a)} />
            ))}
          </ul>
        </div>
      )}

      <label className="mt-4 block">
        <span className="text-sm font-medium text-ink/70">Reason {kind === "permanent" ? "*" : "(optional)"}</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={`e.g. ${dest?.name ?? "The other branch"} is short on ${staff.department || "staff"}`}
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-coral focus:outline-none"
        />
      </label>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-ink/50">
        <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Front desks at both branches see the change on their schedules right away.
      </p>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {confirming ? (
        <div className="mt-4 rounded-xl border-2 border-coral bg-blush p-3">
          <p className="text-sm text-ink">
            {kind === "permanent" ? (
              <>Make <b>{dest?.name}</b> {staff.name}&apos;s home branch from today?</>
            ) : (
              <>Lend <b>{staff.name}</b> to <b>{dest?.name}</b> on {dates.map((d) => formatDay(d, ctx.today)).join(", ")}?</>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirming(false)} disabled={saving} className="flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink/70">
              Back
            </button>
            <button onClick={confirm} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving && <Spinner />} {saving ? "Re-checking & saving…" : "Yes, transfer"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30">
            Cancel
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={!canConfirm}
            title={!result?.ok ? "Every check must pass" : kind === "permanent" && !reason.trim() ? "Add a reason" : undefined}
            className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm transfer
          </button>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1 text-[11px] text-ink/40">
        <CalendarClock className="h-3 w-3" /> Checked again on the server when you confirm.
      </p>
    </Panel>
  );
}
