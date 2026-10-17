"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, Clock, Copy, GripVertical, LayoutGrid, Plus, Rows3, Search, Users } from "lucide-react";
import {
  addDays,
  candidateStaff,
  formatDay,
  formatTime,
  isBranchActive,
  openStarts,
  parseDuration,
  type Appointment,
  type Context,
  type Service,
} from "@/lib/multiBranch/engine";
import { Badge, DetailDrawer, DetailRows, DetailSection, Spinner, TONE, postJson, type Tone } from "./ui";
import { useCardDrag, type DragItem } from "./useCardDrag";
import Image from "next/image";
import { promoImage } from "@/lib/promoImage";
import { SERVICE_LANES, serviceLane, type ServiceLane } from "@/lib/multiBranch/boards";
import { BranchDropBar, Lane, LaneBoard, type LaneTone } from "./Lanes";

const SERVICE_TONE: Record<ServiceLane, LaneTone> = { active: "sage", inactive: "gray", setup: "peach" };

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
  const [view, setView] = useState<"status" | "board" | "table">("status");
  // A service dropped on another branch: offer it there (copy), or there and off here (move).
  const [drop, setDrop] = useState<{ service: Service; to: string } | null>(null);
  // The card whose details are open.
  const [detailId, setDetailId] = useState<string | null>(null);

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

  // ── Board: drag a service card onto another branch ──
  const rowOf = useCallback((s: Service) => rows.find((r) => r.name.toLowerCase() === s.name.toLowerCase()), [rows]);
  const onDrop = useCallback(
    (item: DragItem, branchId: string) => {
      const s = ctx.services.find((x) => x.id === item.id);
      if (!s) return;
      // Already offered there: say so instead of doing nothing.
      if (branchId === s.branchId || rowOf(s)?.byBranch.get(branchId)?.status === "Active") {
        setError(`${s.name} is already offered at ${branches.find((b) => b.id === branchId)?.name ?? "that branch"}.`);
        return;
      }
      setDrop({ service: s, to: branchId });
    },
    [ctx.services, rowOf, branches]
  );
  const { ghost, over, scroller, cardProps, columnRef, dragging } = useCardDrag(onDrop);
  const dragged = dragging ? ctx.services.find((s) => s.id === dragging.id) ?? null : null;
  const hint = (branchId: string): { tone: Tone; text: string } | null => {
    if (!dragged || branchId === dragged.branchId) return null;
    const there = rowOf(dragged)?.byBranch.get(branchId);
    if (there?.status === "Active") return { tone: "red", text: "Already offered here" };
    if (!candidateStaff(ctx, branchId, date, dragged.department ? [dragged.department] : []).length)
      return { tone: "amber", text: `No ${dragged.department || "qualified"} staff here that day — you can still offer it` };
    return { tone: "green", text: there ? "Drop to switch it on here" : "Drop to offer it here" };
  };

  /** Offer at the drop branch (switch on its copy, or add one); "move" also switches it off where it came from. */
  async function applyDrop(move: boolean) {
    if (!drop) return;
    const { service: s, to } = drop;
    const there = rowOf(s)?.byBranch.get(to);
    const key = `${s.name}-${to}`;
    setBusy(key);
    setError(null);
    try {
      await postJson(
        "/api/admin/multi-branch/service",
        there ? { action: "toggle", serviceId: there.id, active: true, reason: "Dragged on the Services board" } : { action: "offer", serviceId: s.id, branchId: to, reason: "Dragged on the Services board" }
      );
      if (move && s.status === "Active") {
        await postJson("/api/admin/multi-branch/service", { action: "toggle", serviceId: s.id, active: false, reason: `Moved to ${branchName(to)}` });
      }
      onChanged(`${s.name} ${move ? "moved" : "now offered"} ${move ? "to" : "at"} ${branchName(to)}.`);
      setDrop(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50 focus-within:border-coral">
          <Search className="h-4 w-4 shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services" className="w-full bg-transparent text-ink outline-none placeholder:text-ink/40" />
        </label>
        <div className="flex rounded-full bg-cream p-1">
          {(
            [
              ["status", "Status", LayoutGrid],
              ["board", "By branch", LayoutGrid],
              ["table", "Table", Rows3],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              aria-pressed={view === k}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold ${view === k ? "bg-white text-ink shadow-sm" : "text-ink/50"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70">
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="w-full text-xs text-ink/50">
          {view === "status" && (
            <>Click a branch chip on a card to switch the service on or off there (✓ = offered, + = add it). Switching off asks first and lists any bookings to review. </>
          )}
          Drag a service onto another branch to offer it there too, or move it. Open slots are for {formatDay(date, ctx.today)}{" "}with qualified staff (same department), for the service&apos;s full duration. Turning a service off never moves
          existing bookings — they&apos;re listed for you to review. Rooms and equipment aren&apos;t tracked in GlowSync.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {view === "status" && (
        <BranchDropBar
          branches={branches}
          dragging={!!dragged}
          over={over}
          zoneRef={columnRef}
          check={(id) => {
            const h = hint(id);
            if (!dragged) return null;
            if (id === dragged.branchId) return { ok: false, text: "Already offered here" };
            return h ? { ok: h.tone !== "red", text: h.text } : null;
          }}
          label="Drag a service onto a branch to offer it there too, or move it"
        />
      )}
      {view === "status" && (
        <LaneBoard scrollerRef={scroller}>
          {SERVICE_LANES.map((lane) => {
            const list = shown
              .map((row) => {
                const all = [...row.byBranch.values()];
                const main = all.find((s) => s.status === "Active") ?? all[0];
                const offeredAt = all.filter((s) => s.status === "Active");
                const qualified = new Set(
                  offeredAt.flatMap((s) => candidateStaff(ctx, s.branchId, date, row.department ? [row.department] : []).map((p) => p.id))
                ).size;
                const issues = [
                  main && main.price <= 0 && !main.hairPrices ? "No price" : null,
                  main && parseDuration(main.duration) <= 0 ? "No duration" : null,
                  offeredAt.length && qualified === 0 ? `No ${row.department || "qualified"} staff` : null,
                ].filter((x): x is string => !!x);
                const laneKey = serviceLane({
                  offered: offeredAt.length > 0,
                  price: main?.price ?? 0,
                  hasSizePrices: !!main?.hairPrices,
                  duration: parseDuration(main?.duration),
                  qualifiedStaff: qualified,
                });
                return { row, main, qualified, issues, laneKey };
              })
              .filter((x) => x.laneKey === lane.key && x.main);
            return (
              <Lane key={lane.key} title={lane.label} hint={lane.hint} count={list.length} tone={SERVICE_TONE[lane.key]}>
                {list.map(({ row, main, qualified, issues }) => (
                  <div
                    key={row.name}
                    {...cardProps({ kind: "service", id: main!.id })}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      setDetailId(main!.id);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && setDetailId(main!.id)}
                    className={`cursor-grab touch-none overflow-hidden rounded-xl border border-[#f1e4c4] bg-white transition active:cursor-grabbing hover:-translate-y-0.5 hover:border-coral/50 hover:shadow-md ${dragging?.id === main!.id ? "opacity-40" : ""}`}
                  >
                    <div className="flex gap-2.5 p-2.5">
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-[#efe3c6]">
                        <Image src={promoImage({ title: row.name, category: row.category })} alt="" fill sizes="48px" className="object-cover" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink" title={row.name}>{row.name}</p>
                        <p className="truncate text-[11px] text-ink/55">{row.category}</p>
                        <p className="text-[11px] text-ink/70">
                          {main!.price > 0 ? `₱${main!.price.toLocaleString()}` : main!.hairPrices ? "Price by size" : "No price"} · {parseDuration(main!.duration)} min · {qualified} qualified
                        </p>
                      </div>
                    </div>
                    {issues.length > 0 && (
                      <p className="mx-2.5 mb-2 rounded-lg bg-[#F9E8D9] px-2 py-1 text-[11px] font-semibold text-[#94602F]">Needs: {issues.join(" · ")}</p>
                    )}
                    <div className="flex flex-wrap gap-1 border-t border-[#f4ecd9] px-2.5 py-2">
                      {branches.map((b) => {
                        const svc = row.byBranch.get(b.id);
                        const on = svc?.status === "Active";
                        const key = `${row.name}-${b.id}`;
                        return (
                          <button
                            key={b.id}
                            disabled={busy === key || (!svc && !isBranchActive(b))}
                            title={on ? `Offered at ${b.name} — click to switch off` : svc ? `Off at ${b.name} — click to switch on` : `Not offered at ${b.name} — click to offer it`}
                            onClick={() =>
                              on
                                ? setConfirm({ service: svc!, affected: affectedBy(svc!) })
                                : svc
                                  ? run(key, { action: "toggle", serviceId: svc.id, active: true, reason: "Re-enabled from Multi-Branch" }, `${row.name} is offered at ${b.name} again.`)
                                  : run(key, { action: "offer", serviceId: main!.id, branchId: b.id, reason: "Offered from Multi-Branch" }, `${row.name} is now offered at ${b.name}.`)
                            }
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition disabled:opacity-50 ${
                              on ? "bg-[#E6EDE2] text-[#4F6B4A] hover:bg-[#d8e3d2]" : "border border-dashed border-ink/20 text-ink/50 hover:border-coral hover:text-coral-dark"
                            }`}
                          >
                            {busy === key ? <Spinner /> : on ? "✓" : "+"} {b.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </Lane>
            );
          })}
        </LaneBoard>
      )}

      {view === "board" && (
        <div ref={scroller} className="scrollbar-hidden -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-4">
          {branches.map((b) => {
            const list = shown.map((r) => r.byBranch.get(b.id)).filter((s): s is Service => !!s);
            const offered = list.filter((s) => s.status === "Active").length;
            const h = hint(b.id);
            return (
              <section
                key={b.id}
                ref={columnRef(b.id)}
                aria-label={`Services at ${b.name}`}
                className={`flex h-[min(46rem,calc(100dvh-12rem))] w-[19rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border-2 transition sm:w-[21rem] ${
                  h ? `${TONE[h.tone].ring} ${TONE[h.tone].soft} shadow-lg` : "border-transparent bg-white shadow-sm"
                }`}
              >
                <header className="shrink-0 border-b border-ink/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate font-semibold text-ink">{b.name}</h2>
                    <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-sm font-bold text-ink/70">{list.length}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-lg bg-green-50 py-1">
                      <p className="text-sm font-bold text-green-700">{offered}</p>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-ink/45">Offered</p>
                    </div>
                    <div className="rounded-lg bg-ink/[0.04] py-1">
                      <p className="text-sm font-bold text-ink">{list.length - offered}</p>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-ink/45">Off</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 py-1">
                      <p className="text-sm font-bold text-blue-700">{candidateStaff(ctx, b.id, date, []).length}</p>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-ink/45">Staff</p>
                    </div>
                  </div>
                  {over === b.id && h && <p className={`mt-2 rounded-lg px-2 py-1.5 text-xs font-semibold ${TONE[h.tone].badge}`}>{h.text}</p>}
                </header>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-2.5 [scrollbar-color:rgba(201,168,74,0.5)_transparent] [scrollbar-width:thin]">
                  {list.map((svc) => {
                    const on = svc.status === "Active";
                    const row = rowOf(svc)!;
                    const qualified = candidateStaff(ctx, b.id, date, svc.department ? [svc.department] : []).length;
                    const slots = slotsFor(row, b.id, date);
                    const affected = affectedBy(svc);
                    const key = `${row.name}-${b.id}`;
                    return (
                      <li
                        key={svc.id}
                        {...cardProps({ kind: "service", id: svc.id })}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("button")) return;
                          setDetailId(svc.id);
                        }}
                        title="Click for details · drag to another branch"
                        className={`group cursor-grab select-none rounded-xl border bg-white p-2.5 transition active:cursor-grabbing ${
                          dragging?.id === svc.id ? "opacity-30" : "hover:-translate-y-0.5 hover:border-coral/50 hover:shadow-md"
                        } ${on ? "border-ink/10" : "border-dashed border-ink/15 bg-ink/[0.02]"}`}
                      >
                        <div className="flex items-start gap-2">
                          <span data-grip className="-my-1 touch-none py-1 text-ink/20 group-hover:text-ink/45" aria-hidden>
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold leading-snug ${on ? "text-ink" : "text-ink/50"}`}>{svc.name}</p>
                            <p className="truncate text-xs text-ink/50">
                              {svc.category} · {parseDuration(svc.duration)} min · ₱{svc.price.toLocaleString()}
                            </p>
                          </div>
                          <button
                            role="switch"
                            aria-checked={on}
                            aria-label={`${svc.name} at ${b.name}: ${on ? "offered" : "off"}`}
                            disabled={busy === key}
                            onClick={() =>
                              on
                                ? setConfirm({ service: svc, affected })
                                : run(key, { action: "toggle", serviceId: svc.id, active: true, reason: "Re-enabled from Multi-Branch" }, `${svc.name} is offered at ${b.name} again.`)
                            }
                            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-green-500" : "bg-ink/20"} disabled:opacity-50`}
                          >
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-3 divide-x divide-ink/5 rounded-lg bg-cream/70 py-1.5 text-center">
                          <div>
                            <p className="text-xs font-bold text-ink">{qualified}</p>
                            <p className="text-[10px] uppercase tracking-wide text-ink/40">Qualified</p>
                          </div>
                          <div>
                            <p className={`text-xs font-bold ${on ? (slots ? "text-green-700" : "text-red-700") : "text-ink/35"}`}>{on ? slots ?? 0 : "—"}</p>
                            <p className="text-[10px] uppercase tracking-wide text-ink/40">Open {formatDay(date, ctx.today) === "Today" ? "today" : "slots"}</p>
                          </div>
                          <div>
                            <p className={`text-xs font-bold ${affected.length ? "text-amber-700" : "text-ink"}`}>{affected.length}</p>
                            <p className="text-[10px] uppercase tracking-wide text-ink/40">Booked</p>
                          </div>
                        </div>
                        {!on && <p className="mt-1.5 text-[11px] font-semibold text-ink/45">Not offered here — switch on to bring it back</p>}
                      </li>
                    );
                  })}
                  {list.length === 0 && (
                    <li className="rounded-xl border-2 border-dashed border-ink/10 px-3 py-6 text-center text-xs text-ink/35">No services match</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {ghost && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[90] rounded-xl border border-coral bg-white p-2.5 shadow-2xl"
          style={{ width: ghost.w, transform: `translate(${ghost.x - ghost.ox}px, ${ghost.y - ghost.oy}px) rotate(2deg)` }}
        >
          <p className="text-sm font-semibold text-ink">{dragged?.name}</p>
          <p className="text-xs text-ink/50">Drop on a branch</p>
        </div>
      )}

      {(() => {
        const svc = detailId ? ctx.services.find((s) => s.id === detailId) : null;
        if (!svc) return null;
        const row = rowOf(svc);
        const depts = svc.department ? [svc.department] : [];
        const staff = candidateStaff(ctx, svc.branchId, date, depts);
        const bookings = affectedBy(svc).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
        const sizes = svc.hairPrices ? Object.entries(svc.hairPrices) : [];
        return (
          <DetailDrawer
            title={svc.name}
            subtitle={
              <>
                {svc.category} · at {branchName(svc.branchId)} <Badge tone={svc.status === "Active" ? "green" : "gray"}>{svc.status === "Active" ? "Offered" : "Off"}</Badge>
              </>
            }
            onClose={() => setDetailId(null)}
          >
            <DetailSection label="Description">{svc.description?.trim() || <span className="text-ink/40">No description yet.</span>}</DetailSection>
            {svc.benefits?.trim() && <DetailSection label="Benefits"><p className="whitespace-pre-line">{svc.benefits}</p></DetailSection>}
            <DetailRows
              rows={[
                ["Price", sizes.length ? sizes.map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ₱${Number(v).toLocaleString()}`).join(" · ") : `₱${svc.price.toLocaleString()}`],
                ["Duration", `${parseDuration(svc.duration)} min`],
                ["Department", svc.department || "—"],
                ["Category", svc.category || "—"],
              ]}
            />
            <DetailSection label={`Who can do it · ${formatDay(date, ctx.today)}`}>
              {staff.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {staff.map((s) => (
                    <li key={s.id} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{s.name}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink/45">No {svc.department || "qualified"} staff working that day.</span>
              )}
              <p className="mt-1 text-xs text-ink/45">Staff in the {svc.department || "same"} department, working at this branch that day (off, on leave or lent out don&apos;t count).</p>
            </DetailSection>
            {row && svc.status === "Active" && (
              <DetailSection label="Open times, next 7 days">
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 7 }, (_, i) => addDays(ctx.today, i)).map((d) => {
                    const n = slotsFor(row, svc.branchId, d) ?? 0;
                    return (
                      <span key={d} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${n ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {formatDay(d, ctx.today)} · {n}
                      </span>
                    );
                  })}
                </div>
              </DetailSection>
            )}
            <DetailSection label={`Upcoming bookings · ${bookings.length}`}>
              {bookings.length ? (
                <ul className="space-y-1">
                  {bookings.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex justify-between gap-2 rounded-lg bg-cream/60 px-2.5 py-1.5 text-xs">
                      <span className="font-medium text-ink">{a.clientName}</span>
                      <span className="text-ink/55">{formatDay(a.date, ctx.today)} · {formatTime(a.start)}</span>
                    </li>
                  ))}
                  {bookings.length > 8 && <li className="text-xs text-ink/45">+{bookings.length - 8} more</li>}
                </ul>
              ) : (
                <span className="text-ink/45">None in the next two weeks.</span>
              )}
            </DetailSection>
            <DetailSection label="At each branch">
              <ul className="space-y-1">
                {branches.map((b) => {
                  const there = row?.byBranch.get(b.id);
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-2">
                      <span>{b.name}</span>
                      <Badge tone={!there ? "gray" : there.status === "Active" ? "green" : "red"}>{!there ? "Not offered" : there.status === "Active" ? "Offered" : "Off"}</Badge>
                    </li>
                  );
                })}
              </ul>
            </DetailSection>
          </DetailDrawer>
        );
      })()}

      {drop && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 px-4" onClick={() => setDrop(null)}>
          <div role="dialog" aria-modal="true" aria-label="Offer service at another branch" className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-ink">
              {drop.service.name} → {branchName(drop.to)}
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              {rowOf(drop.service)?.byBranch.get(drop.to) ? "It's switched off there — this switches it back on." : "A copy is added there with the same price, duration and details."}
            </p>
            <div className="mt-4 space-y-2">
              <button
                disabled={!!busy}
                onClick={() => applyDrop(false)}
                className="flex w-full items-start gap-3 rounded-xl border-2 border-ink/10 p-3 text-left transition hover:border-coral hover:bg-blush disabled:opacity-50"
              >
                <Copy className="mt-0.5 h-4 w-4 shrink-0 text-coral-dark" />
                <span>
                  <span className="block font-semibold text-ink">Offer at both</span>
                  <span className="block text-xs text-ink/55">Keep it at {branchName(drop.service.branchId)} too.</span>
                </span>
              </button>
              <button
                disabled={!!busy || drop.service.status !== "Active"}
                onClick={() => applyDrop(true)}
                className="flex w-full items-start gap-3 rounded-xl border-2 border-ink/10 p-3 text-left transition hover:border-coral hover:bg-blush disabled:opacity-50"
              >
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-coral-dark" />
                <span>
                  <span className="block font-semibold text-ink">Move</span>
                  <span className="block text-xs text-ink/55">
                    Offered at {branchName(drop.to)}, switched off at {branchName(drop.service.branchId)}.
                    {affectedBy(drop.service).length
                      ? ` ${affectedBy(drop.service).length} upcoming booking${affectedBy(drop.service).length === 1 ? " stays" : "s stay"} as booked — review them on the Staff tab.`
                      : ""}
                  </span>
                </span>
              </button>
              <button onClick={() => setDrop(null)} className="w-full rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "table" && (
      <div className="space-y-2">
        {/* What the little icons mean */}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-ink/50">
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> qualified staff working</span>
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> open start times {formatDay(date, ctx.today).toLowerCase()}</span>
          <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> upcoming bookings</span>
        </p>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[44rem] table-fixed text-sm">
          <colgroup>
            <col className="w-[34%]" />
            {branches.map((b) => (
              <col key={b.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-wide text-ink/45">
              <th className="px-4 py-3 font-semibold">Service</th>
              {branches.map((b) => (
                <th key={b.id} className="truncate px-3 py-3 font-semibold">{b.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => {
              const any = [...row.byBranch.values()][0];
              const isOpen = open === row.name;
              const newGroup = i === 0 || shown[i - 1].category !== row.category;
              const groupSize = newGroup ? shown.filter((r) => r.category === row.category).length : 0;
              return (
                <Fragment key={row.name}>
                  {newGroup && (
                    <tr className="bg-cream/70">
                      <td colSpan={branches.length + 1} className="px-4 py-1.5 text-xs font-bold text-ink/60">
                        {row.category || "Other"} <span className="font-medium text-ink/40">· {groupSize}</span>
                      </td>
                    </tr>
                  )}
                  <tr className={`border-b border-ink/5 transition hover:bg-[#fffaf0] ${isOpen ? "bg-[#fffaf0]" : ""}`}>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setOpen(isOpen ? null : row.name)} className="flex w-full items-center gap-1.5 text-left" aria-expanded={isOpen}>
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-ink/40" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink/40" />}
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{row.name}</span>
                          <span className="block truncate text-xs text-ink/50">
                            {row.department || "—"} · {parseDuration(any?.duration)} min · ₱{(any?.price ?? 0).toLocaleString()}
                          </span>
                        </span>
                      </button>
                    </td>
                    {branches.map((b) => {
                      const svc = row.byBranch.get(b.id);
                      const active = svc?.status === "Active";
                      const qualified = candidateStaff(ctx, b.id, date, row.department ? [row.department] : []).length;
                      const slots = slotsFor(row, b.id, date) ?? 0;
                      const affected = svc ? affectedBy(svc) : [];
                      const key = `${row.name}-${b.id}`;
                      const chip = "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold";
                      return (
                        <td key={b.id} className="px-3 py-2.5">
                          {svc ? (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <button
                                role="switch"
                                aria-checked={active}
                                aria-label={`${row.name} at ${b.name}: ${active ? "on" : "off"}`}
                                disabled={busy === key}
                                onClick={() =>
                                  active
                                    ? setConfirm({ service: svc, affected })
                                    : run(key, { action: "toggle", serviceId: svc.id, active: true, reason: "Re-enabled from Multi-Branch" }, `${row.name} is offered at ${b.name} again.`)
                                }
                                className="flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <span className={`relative h-5 w-9 rounded-full transition ${active ? "bg-green-500" : "bg-ink/20"}`}>
                                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${active ? "left-[18px]" : "left-0.5"}`} />
                                </span>
                                <span className={`w-7 text-xs font-semibold ${active ? "text-green-700" : "text-ink/45"}`}>{busy === key ? <Spinner /> : active ? "On" : "Off"}</span>
                              </button>
                              {active && (
                                <>
                                  <span className={`${chip} bg-ink/5 text-ink/60`} title={`${qualified} qualified ${row.department || ""} staff working ${formatDay(date, ctx.today)}`}>
                                    <Users className="h-3 w-3" /> {qualified}
                                  </span>
                                  <span
                                    className={`${chip} ${slots ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
                                    title={slots ? `${slots} open start times ${formatDay(date, ctx.today)}` : `No open time ${formatDay(date, ctx.today)} (fully booked or no staff working)`}
                                  >
                                    <Clock className="h-3 w-3" /> {slots ? `${slots} slots` : "No slots"}
                                  </span>
                                </>
                              )}
                              {affected.length > 0 && (
                                <span className={`${chip} bg-blue-50 text-blue-700`} title={`${affected.length} upcoming booking${affected.length === 1 ? "" : "s"}`}>
                                  <CalendarDays className="h-3 w-3" /> {affected.length}
                                </span>
                              )}
                            </div>
                          ) : isBranchActive(b) && any ? (
                            <button
                              disabled={busy === key}
                              onClick={() => run(key, { action: "offer", serviceId: any.id, branchId: b.id, reason: "Offered from Multi-Branch" }, `${row.name} is now offered at ${b.name}.`)}
                              title={qualified === 0 ? `No ${row.department} staff here — you can still offer it` : undefined}
                              className="inline-flex items-center gap-1 rounded-full border border-dashed border-coral/60 px-2.5 py-1 text-xs font-semibold text-coral-dark transition hover:bg-blush disabled:opacity-50"
                            >
                              {busy === key ? <Spinner /> : <Plus className="h-3 w-3" />} Offer here
                            </button>
                          ) : (
                            <span className="text-xs text-ink/40">Not offered</span>
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
                                        title={n === null ? "Not offered" : n === 0 ? "No open time that day" : `${n} open start times`}
                                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                                          n === null ? "bg-ink/5 text-ink/40" : n === 0 ? "bg-amber-50 text-amber-700" : "bg-green-100 text-green-700"
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
      </div>
      )}

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
