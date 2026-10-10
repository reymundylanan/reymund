"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import {
  addDays,
  candidateStaff,
  formatDay,
  isBranchActive,
  openStarts,
  parseDuration,
  type Appointment,
  type Context,
  type Service,
} from "@/lib/multiBranch/engine";
import { Badge, Spinner, postJson } from "./ui";

type Row = { name: string; category: string; department: string; byBranch: Map<string, Service> };

/** Where each service is offered, who can do it, and how much room is left. */
export default function ServicesPanel({
  ctx,
  date,
  onChanged,
  onReschedule,
}: {
  ctx: Context;
  date: string;
  onChanged: (message: string) => void;
  onReschedule: (a: Appointment) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ service: Service; affected: Appointment[] } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const branches = ctx.branches;
  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const s of ctx.services) {
      const key = s.name.toLowerCase();
      const row = map.get(key) ?? { name: s.name, category: s.category, department: s.department, byBranch: new Map() };
      if (!row.byBranch.has(s.branchId) || s.status === "Active") row.byBranch.set(s.branchId, s);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [ctx.services]);
  const categories = useMemo(() => ["All", ...new Set(rows.map((r) => r.category).filter(Boolean))], [rows]);
  const shown = rows.filter(
    (r) => (category === "All" || r.category === category) && (!query.trim() || `${r.name} ${r.department}`.toLowerCase().includes(query.trim().toLowerCase()))
  );

  const affectedBy = (svc: Service) =>
    ctx.appointments.filter((a) => a.branchId === svc.branchId && a.services.some((n) => n.toLowerCase() === svc.name.toLowerCase()));

  // Slots depend only on department, duration, branch and day: count each
  // distinct combination once per load.
  const slotTable = useMemo(() => {
    const table = new Map<string, number>();
    const combos = new Map<string, { dept: string; duration: number }>();
    for (const s of ctx.services) {
      const duration = parseDuration(s.duration);
      combos.set(`${s.department}|${duration}`, { dept: s.department, duration });
    }
    const days = [...new Set([date, ...Array.from({ length: 7 }, (_, i) => addDays(ctx.today, i))])];
    for (const [combo, { dept, duration }] of combos) {
      const depts = dept ? [dept] : [];
      for (const b of ctx.branches) {
        for (const day of days) {
          const n = candidateStaff(ctx, b.id, day, depts).reduce(
            (sum, s) => sum + openStarts(ctx, { branchId: b.id, staffId: s.id, date: day, duration, departments: depts, services: [] }).length,
            0
          );
          table.set(`${combo}|${b.id}|${day}`, n);
        }
      }
    }
    return table;
  }, [ctx, date]);
  const slotsFor = (row: Row, branchId: string, day: string): number | null => {
    const svc = row.byBranch.get(branchId);
    if (!svc || svc.status !== "Active") return null;
    return slotTable.get(`${svc.department}|${parseDuration(svc.duration)}|${branchId}|${day}`) ?? 0;
  };

  async function run(key: string, body: Record<string, unknown>, message: string) {
    setBusy(key);
    setError(null);
    try {
      await postJson("/api/admin/multi-branch/service", body);
      onChanged(message);
      setConfirm(null);
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "—";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50 focus-within:border-coral">
          <Search className="h-4 w-4 shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services" className="w-full bg-transparent text-ink outline-none placeholder:text-ink/40" />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70">
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="w-full text-xs text-ink/50">
          Open slots are for {formatDay(date, ctx.today)} with qualified staff (same department), for the service&apos;s full duration. Turning a service off never moves
          existing bookings — they&apos;re listed for you to review. Rooms and equipment aren&apos;t tracked in GlowSync.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/45">
              <th className="px-4 py-3 font-semibold">Service</th>
              {branches.map((b) => (
                <th key={b.id} className="px-3 py-3 font-semibold">{b.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const any = [...row.byBranch.values()][0];
              const isOpen = open === row.name;
              return (
                <Fragment key={row.name}>
                  <tr className="border-b border-ink/5 align-top">
                    <td className="px-4 py-3">
                      <button onClick={() => setOpen(isOpen ? null : row.name)} className="flex items-start gap-1.5 text-left" aria-expanded={isOpen}>
                        {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 text-ink/40" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-ink/40" />}
                        <span>
                          <span className="block font-medium text-ink">{row.name}</span>
                          <span className="block text-xs text-ink/50">
                            {row.category} · {row.department || "—"} · {parseDuration(any?.duration)} min · ₱{(any?.price ?? 0).toLocaleString()}
                          </span>
                        </span>
                      </button>
                    </td>
                    {branches.map((b) => {
                      const svc = row.byBranch.get(b.id);
                      const active = svc?.status === "Active";
                      const qualified = candidateStaff(ctx, b.id, date, row.department ? [row.department] : []).length;
                      const slots = slotsFor(row, b.id, date);
                      const affected = svc ? affectedBy(svc) : [];
                      const key = `${row.name}-${b.id}`;
                      return (
                        <td key={b.id} className="px-3 py-3">
                          {svc ? (
                            <div className="space-y-1">
                              <Badge tone={active ? "green" : "red"}>{active ? "Offered" : "Off"}</Badge>
                              {active && (
                                <p className="text-xs text-ink/55">
                                  {qualified} qualified · <span className={slots ? "text-green-700" : "text-red-700"}>{slots ?? 0} open</span>
                                </p>
                              )}
                              {affected.length > 0 && <p className="text-xs text-ink/45">{affected.length} upcoming booking{affected.length === 1 ? "" : "s"}</p>}
                              <button
                                disabled={busy === key}
                                onClick={() =>
                                  active
                                    ? setConfirm({ service: svc, affected })
                                    : run(key, { action: "toggle", serviceId: svc.id, active: true, reason: "Re-enabled from Multi-Branch" }, `${row.name} is offered at ${b.name} again.`)
                                }
                                className="text-xs font-semibold text-coral-dark hover:underline disabled:opacity-50"
                              >
                                {busy === key ? <Spinner /> : active ? "Turn off" : "Turn on"}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Badge tone="gray">Not offered</Badge>
                              {isBranchActive(b) && any && (
                                <button
                                  disabled={busy === key}
                                  onClick={() =>
                                    run(key, { action: "offer", serviceId: any.id, branchId: b.id, reason: "Offered from Multi-Branch" }, `${row.name} is now offered at ${b.name}.`)
                                  }
                                  className="flex items-center gap-1 text-xs font-semibold text-coral-dark hover:underline disabled:opacity-50"
                                >
                                  {busy === key ? <Spinner /> : <Plus className="h-3 w-3" />} Offer here
                                </button>
                              )}
                              {qualified === 0 && <p className="text-xs text-ink/45">No {row.department} staff</p>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-ink/5 bg-cream/40">
                      <td colSpan={branches.length + 1} className="px-4 py-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          {branches.map((b) => {
                            const staff = candidateStaff(ctx, b.id, date, row.department ? [row.department] : []);
                            return (
                              <div key={b.id} className="rounded-xl bg-white p-3">
                                <p className="font-semibold text-ink">{b.name}</p>
                                <p className="mt-1 text-xs text-ink/55">
                                  Qualified staff on {formatDay(date, ctx.today)}: {staff.length ? staff.map((s) => s.name).join(", ") : "none"}
                                </p>
                                <p className="mt-2 text-xs font-semibold text-ink/60">Open slots, next 7 days</p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {Array.from({ length: 7 }, (_, i) => addDays(ctx.today, i)).map((d) => {
                                    const n = slotsFor(row, b.id, d);
                                    return (
                                      <span
                                        key={d}
                                        title={n === null ? "Not offered" : n === 0 ? "Unavailable all day" : `${n} open start times`}
                                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                                          n === null ? "bg-ink/5 text-ink/40" : n === 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                                        }`}
                                      >
                                        {formatDay(d, ctx.today)} · {n ?? "—"}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={branches.length + 1} className="px-4 py-8 text-center text-sm text-ink/45">No services match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirm(null)}>
          <div role="dialog" aria-modal="true" aria-label="Turn off service" className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-ink">Stop offering {confirm.service.name} at {branchName(confirm.service.branchId)}?</h2>
            <p className="mt-1 text-sm text-ink/60">Clients won&apos;t be able to book it there. Existing bookings are not moved or cancelled.</p>
            {confirm.affected.length > 0 && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800">
                  {confirm.affected.length} upcoming booking{confirm.affected.length === 1 ? "" : "s"} to review:
                </p>
                <ul className="mt-1 space-y-1">
                  {confirm.affected.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-xs text-amber-900">
                      <span>{formatDay(a.date, ctx.today)} · {a.clientName}</span>
                      <button onClick={() => { setConfirm(null); onReschedule(a); }} className="font-semibold underline">Reschedule</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label className="mt-3 block">
              <span className="text-sm font-medium text-ink/70">Reason (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm" />
            </label>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirm(null)} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70">Cancel</button>
              <button
                disabled={!!busy}
                onClick={() =>
                  run(confirm.service.id, { action: "toggle", serviceId: confirm.service.id, active: false, reason }, `${confirm.service.name} is off at ${branchName(confirm.service.branchId)}.`)
                }
                className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Turn off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
