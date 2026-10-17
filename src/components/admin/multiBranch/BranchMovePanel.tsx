"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bell, CalendarClock, CircleAlert, Wallet } from "lucide-react";
import { formatDay, formatTime, isBranchActive, toMinutes, toTime, type Appointment, type Context } from "@/lib/multiBranch/engine";
import type { BranchMoveItem } from "@/lib/multiBranch/branchMove";
import { Panel, Side } from "./TransferPreview";
import { Spinner, postJson } from "./ui";

type Result = { moved: number; failed: { appointmentId: string; reason: string }[]; items: BranchMoveItem[] };

/**
 * A branch closed: move its upcoming bookings to another open branch in one
 * go. Each booking keeps its day and time when a qualified person is free
 * there (their own staff first), otherwise the nearest free time that day.
 * Nothing is forced — bookings without a valid slot stay put and can be
 * rescheduled one by one.
 */
export default function BranchMovePanel({
  ctx,
  fromBranchId,
  onClose,
  onChanged,
  onReschedule,
}: {
  ctx: Context;
  fromBranchId: string;
  onClose: () => void;
  onChanged: (text: string) => void;
  onReschedule: (a: Appointment) => void;
}) {
  const from = ctx.branches.find((b) => b.id === fromBranchId);
  const options = ctx.branches.filter((b) => b.id !== fromBranchId && isBranchActive(b));
  const [toBranchId, setToBranchId] = useState(options[0]?.id ?? "");
  const [items, setItems] = useState<BranchMoveItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!toBranchId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the plan for the chosen branch
    setLoading(true);
    postJson<{ items: BranchMoveItem[] }>("/api/admin/multi-branch/preview", { type: "branch", fromBranchId, toBranchId })
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setError(null);
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fromBranchId, toBranchId]);

  const staffName = (id: string | null) => (id ? ctx.staff.find((s) => s.id === id)?.name ?? "—" : "Any available");
  const dest = ctx.branches.find((b) => b.id === toBranchId);
  const offered = new Set(ctx.services.filter((s) => s.branchId === toBranchId && s.status === "Active").map((s) => s.name));
  const whyNot = (a: Appointment) => {
    const missing = a.services.filter((s) => !offered.has(s));
    return missing.length
      ? `${dest?.name} doesn't offer ${missing.join(", ")}.`
      : `No qualified staff at ${dest?.name} is free for the full ${a.duration} min that day.`;
  };
  const movable = (items ?? []).filter((i) => i.proposal);
  const moves = movable.filter((i) => !skip.has(i.appointment.id));
  const stuck = (items ?? []).filter((i) => !i.proposal);
  const sameTime = moves.filter((i) => i.proposal!.start === toMinutes(i.appointment.start)).length;

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const r = await postJson<Result>("/api/admin/multi-branch/move-branch", {
        fromBranchId,
        toBranchId,
        reason,
        moves: moves.map((i) => ({ appointmentId: i.appointment.id, staffId: i.proposal!.staffId, date: i.proposal!.date, start: toTime(i.proposal!.start) })),
      });
      const text = `${r.moved} booking${r.moved === 1 ? "" : "s"} moved from ${from?.name} to ${dest?.name}.`;
      onChanged(r.failed.length ? `${text} ${r.failed.length} couldn't be moved — see the list.` : text);
      // Everything moved: nothing left to show.
      if (!r.failed.length && !r.items.length) return onClose();
      setItems(r.items);
      setFailed(new Map(r.failed.map((f) => [f.appointmentId, f.reason])));
      setSkip(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
    setConfirming(false);
    setSaving(false);
  }

  return (
    <Panel title={`Move bookings from ${from?.name ?? "branch"}`} onClose={onClose} drawer>
      <p className="rounded-xl bg-[#F6E3E3] px-3 py-2 text-xs text-[#9A5257]">
        <b>{from?.name}</b> {isBranchActive(from) ? "is selected" : "isn't open for bookings"}. Move its upcoming bookings to a branch that&apos;s open — each one is
        checked for free, qualified staff, the service and the opening hours.
      </p>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side label="From" tone="old">
          <p className="font-semibold">{from?.name}</p>
          <p className="text-xs text-ink/50">{items ? `${items.length} upcoming` : "…"}</p>
        </Side>
        <ArrowRight className="h-4 w-4 text-coral-dark" />
        <Side label="To" tone="new">
          {options.length ? (
            <select
              value={toBranchId}
              onChange={(e) => {
                setToBranchId(e.target.value);
                setSkip(new Set());
                setFailed(new Map());
              }}
              aria-label="Move to branch"
              className="w-full bg-transparent font-semibold outline-none"
            >
              {options.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-[#9A5257]">No other branch is open.</p>
          )}
        </Side>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">Upcoming bookings {loading && <Spinner className="text-coral" />}</h3>
          {movable.length > 1 && (
            <button
              onClick={() => setSkip(moves.length === movable.length ? new Set(movable.map((i) => i.appointment.id)) : new Set())}
              className="text-xs font-semibold text-coral-dark hover:underline"
            >
              {moves.length === movable.length ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
        {!loading && items?.length === 0 && <p className="rounded-xl bg-[#E6EDE2] px-3 py-3 text-sm text-[#4F6B4A]">No upcoming bookings left at {from?.name}. 🎉</p>}
        {!loading && items && items.length > 0 && (
          <p className="mb-2 text-xs text-ink/55">
            {movable.length} of {items.length} can move to {dest?.name}
            {moves.length ? ` · ${sameTime} at the same time` : ""}.
          </p>
        )}
        <ul className={`space-y-2 ${loading ? "opacity-50" : ""}`}>
          {(items ?? []).map(({ appointment: a, proposal }) => {
            const start = toMinutes(a.start);
            const on = !!proposal && !skip.has(a.id);
            const err = failed.get(a.id);
            return (
              <li key={a.id} className={`rounded-xl border p-2.5 text-sm ${on ? "border-coral/50 bg-blush" : "border-ink/10"}`}>
                <label className={`flex items-start gap-2 ${proposal ? "cursor-pointer" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!proposal}
                    onChange={(e) =>
                      setSkip((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.delete(a.id);
                        else n.add(a.id);
                        return n;
                      })
                    }
                    className="mt-1 h-4 w-4 accent-coral"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">
                      {a.clientName} <span className="font-normal text-ink/55">· {a.serviceLabel}</span>
                    </span>
                    <span className="block text-xs text-ink/55">
                      Now: {formatDay(a.date, ctx.today)} {formatTime(start)} · {staffName(a.professionalId)}
                    </span>
                    {proposal ? (
                      <span className="block text-xs font-semibold text-green-700">
                        → {dest?.name} · {formatDay(proposal.date, ctx.today)} {formatTime(proposal.start)} · {staffName(proposal.staffId)}
                        {proposal.start !== start ? " (nearest free time)" : ""}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-xs text-red-700">{whyNot(a)}</span>
                    )}
                    {err && (
                      <span className="mt-0.5 flex items-start gap-1 text-xs text-red-700">
                        <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" /> Not moved: {err}
                      </span>
                    )}
                    {a.paid && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink/50">
                        <Wallet className="h-3 w-3" /> Payment stays with the booking
                      </span>
                    )}
                  </span>
                </label>
                {!proposal && ctx.appointments.some((x) => x.id === a.id) && (
                  <button onClick={() => onReschedule(a)} className="ml-6 mt-1.5 rounded-full border border-coral/40 px-2.5 py-1 text-[11px] font-semibold text-coral-dark hover:bg-blush">
                    Pick another day, time or branch
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {stuck.length > 0 && (
          <p className="mt-2 text-xs text-ink/50">
            Bookings without a free slot are never forced — try another branch above, lend staff to {dest?.name ?? "it"} from the Staff board, or reschedule them one by one.
          </p>
        )}
      </div>

      {moves.length > 0 && (
        <>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-cream px-3 py-2 text-xs text-ink/70">
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral-dark" />
            <span>Each client is told about their new branch and time, only after you confirm. Payments and history stay with the booking.</span>
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-ink/70">Reason (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`${from?.name} is closed — moved to ${dest?.name}`}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-coral focus:outline-none"
            />
          </label>
        </>
      )}

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {confirming ? (
        <div className="mt-4 rounded-xl border-2 border-coral bg-blush p-3">
          <p className="text-sm text-ink">
            Move <b>{moves.length}</b> booking{moves.length === 1 ? "" : "s"} from <b>{from?.name}</b> to <b>{dest?.name}</b>? Each one is checked again before it&apos;s saved.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirming(false)} disabled={saving} className="flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink/70">
              Back
            </button>
            <button onClick={confirm} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving && <Spinner />} {saving ? "Checking & moving…" : "Yes, move them"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30">
            Close
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={loading || moves.length === 0}
            className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Move {moves.length || ""} booking{moves.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1 text-[11px] text-ink/40">
        <CalendarClock className="h-3 w-3" /> Nothing changes until you confirm.
      </p>
    </Panel>
  );
}
