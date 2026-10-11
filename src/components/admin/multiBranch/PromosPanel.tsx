"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, GripVertical, LayoutGrid, Rows3, Search, Tag } from "lucide-react";
import type { Context } from "@/lib/multiBranch/engine";
import { Badge, DetailDrawer, DetailRows, DetailSection, Spinner, TONE, postJson, type Tone } from "./ui";
import { useCardDrag, type DragItem } from "./useCardDrag";

type Promo = {
  id: string;
  branch_id: string;
  title: string;
  category: string | null;
  department: string | null;
  price: number | null;
  price_medium: number | null;
  price_long: number | null;
  badge: string | null;
  description?: string | null;
  discount_type?: string | null;
  discount_value?: string | null;
  created_at?: string;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  services: string[];
  upcomingBookings: number;
};
type Row = { key: string; title: string; category: string | null; any: Promo; byBranch: Map<string, Promo> };
type Ask = { kind: "off"; promo: Promo } | { kind: "move" | "copy" | "drop"; promo: Promo; to: string };

const peso = (n: number | null) => (n == null ? "—" : `₱${Number(n).toLocaleString()}`);
const day = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/** Live / Scheduled / Expired / Off, from the switch and the promo dates. */
function promoState(p: Promo, today: string): { label: string; tone: Tone } {
  if (!p.is_active) return { label: "Off", tone: "gray" };
  if (p.valid_until && p.valid_until < today) return { label: "Expired", tone: "red" };
  if (p.valid_from && p.valid_from > today) return { label: "Scheduled", tone: "amber" };
  return { label: "Live", tone: "green" };
}

/** Promos across branches: switch them on/off per branch, copy or move them. */
export default function PromosPanel({ ctx, onChanged }: { ctx: Context; onChanged: (message: string) => void }) {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [today, setToday] = useState(ctx.today);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [view, setView] = useState<"board" | "table">("board");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/multi-branch/promos");
      const j = (await r.json()) as { promos?: Promo[]; today?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Couldn't load promos.");
      setPromos(j.promos ?? []);
      if (j.today) setToday(j.today);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)load promos
    load();
  }, [load, tick]);

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const p of promos ?? []) {
      const key = p.title.toLowerCase().trim();
      const row = map.get(key) ?? { key, title: p.title, category: p.category, any: p, byBranch: new Map() };
      // Two copies at one branch: show the one that's on.
      const cur = row.byBranch.get(p.branch_id);
      if (!cur || (!cur.is_active && p.is_active)) row.byBranch.set(p.branch_id, p);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.title.localeCompare(b.title));
  }, [promos]);

  const shown = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (s && !`${r.title} ${r.category ?? ""} ${r.any.badge ?? ""}`.toLowerCase().includes(s)) return false;
    if (status === "all") return true;
    return [...r.byBranch.values()].some((p) => promoState(p, today).label.toLowerCase() === status);
  });

  const branchName = (id: string) => ctx.branches.find((b) => b.id === id)?.name ?? "—";

  // ── Board: a column per branch; drag a promo onto another branch ──
  const rowOf = useCallback((p: Promo) => rows.find((r) => r.key === p.title.toLowerCase().trim()), [rows]);
  const onDrop = useCallback(
    (item: DragItem, branchId: string) => {
      const p = (promos ?? []).find((x) => x.id === item.id);
      if (!p || branchId === p.branch_id) return;
      if (rowOf(p)?.byBranch.get(branchId)?.is_active) {
        setError(`“${p.title}” is already live at ${branchName(branchId)}.`);
        return;
      }
      setAsk({ kind: "drop", promo: p, to: branchId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- branchName reads ctx
    [promos, rowOf, ctx]
  );
  const { ghost, over, scroller, cardProps, columnRef, dragging } = useCardDrag(onDrop);
  const dragged = dragging ? (promos ?? []).find((p) => p.id === dragging.id) ?? null : null;
  const hint = (branchId: string): { tone: Tone; text: string } | null => {
    if (!dragged || branchId === dragged.branch_id) return null;
    const there = rowOf(dragged)?.byBranch.get(branchId);
    if (there?.is_active) return { tone: "red", text: "Already live here" };
    if (there) return { tone: "green", text: "Drop to switch it on here" };
    return { tone: "green", text: "Drop to copy or move here" };
  };

  async function run(key: string, body: unknown, message: string) {
    setBusy(key);
    setError(null);
    try {
      await postJson("/api/admin/multi-branch/promos", body);
      onChanged(message);
      setTick((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
    setAsk(null);
  }

  const counts = useMemo(() => {
    const all = promos ?? [];
    return {
      live: all.filter((p) => promoState(p, today).label === "Live").length,
      off: all.filter((p) => !p.is_active).length,
      expired: all.filter((p) => promoState(p, today).label === "Expired").length,
    };
  }, [promos, today]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50 focus-within:border-coral">
          <Search className="h-4 w-4 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search promos" className="w-full bg-transparent text-ink outline-none placeholder:text-ink/40" />
        </label>
        <div className="flex rounded-full bg-cream p-1">
          {(
            [
              ["board", "Board", LayoutGrid],
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
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Promo status" className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70">
          <option value="all">All promos</option>
          <option value="live">Live ({counts.live})</option>
          <option value="scheduled">Scheduled</option>
          <option value="off">Off ({counts.off})</option>
          <option value="expired">Expired ({counts.expired})</option>
        </select>
        <p className="w-full text-xs text-ink/50">
              Drag a promo onto another branch to copy or move it (copied there, switched off here), or use its switch to turn it on or off. Bookings already made
          with a promo keep it. Edit a promo&apos;s details in Branches &amp; Services → Promotions.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!promos && !error && (
        <p className="flex items-center gap-2 text-sm text-ink/50">
          <Spinner /> Loading promos…
        </p>
      )}

      {promos && view === "board" && (
        <div ref={scroller} className="scrollbar-hidden -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-4">
          {ctx.branches.map((b) => {
            const list = shown.map((r) => r.byBranch.get(b.id)).filter((p): p is Promo => !!p);
            const live = list.filter((p) => promoState(p, today).label === "Live").length;
            const h = hint(b.id);
            return (
              <section
                key={b.id}
                ref={columnRef(b.id)}
                aria-label={`Promos at ${b.name}`}
                className={`flex h-[min(44rem,calc(100dvh-12rem))] w-[19rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border-2 transition sm:w-[21rem] ${
                  h ? `${TONE[h.tone].ring} ${TONE[h.tone].soft} shadow-lg` : "border-transparent bg-white shadow-sm"
                }`}
              >
                <header className="shrink-0 border-b border-ink/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate font-semibold text-ink">{b.name}</h2>
                    <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-sm font-bold text-ink/70">{list.length}</span>
                  </div>
                  <p className="text-xs text-ink/50">
                    {live} live · {list.length - live} off, scheduled or expired
                  </p>
                  {over === b.id && h && <p className={`mt-2 rounded-lg px-2 py-1.5 text-xs font-semibold ${TONE[h.tone].badge}`}>{h.text}</p>}
                </header>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2.5 [scrollbar-color:rgba(201,168,74,0.5)_transparent] [scrollbar-width:thin]">
                  {list.map((p) => {
                    const st = promoState(p, today);
                    const cellKey = `${p.title.toLowerCase().trim()}-${b.id}`;
                    return (
                      <li
                        key={p.id}
                        {...cardProps({ kind: "promo", id: p.id })}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("button")) return;
                          setDetailId(p.id);
                        }}
                        title="Click for details · drag to another branch"
                        className={`group cursor-grab select-none rounded-xl border bg-white p-2.5 transition active:cursor-grabbing ${
                          dragging?.id === p.id ? "opacity-30" : "hover:-translate-y-0.5 hover:border-coral/50 hover:shadow-md"
                        } ${p.is_active ? "border-ink/10" : "border-dashed border-ink/15 bg-ink/[0.02]"}`}
                      >
                        <div className="flex items-start gap-2">
                          <span data-grip className="-my-1 touch-none py-1 text-ink/20 group-hover:text-ink/45" aria-hidden>
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold leading-snug ${p.is_active ? "text-ink" : "text-ink/50"}`}>{p.title}</p>
                            <p className="truncate text-xs text-ink/50">
                              {[p.category, p.badge].filter(Boolean).join(" · ") || "Promo"}
                              {p.valid_until ? ` · until ${day(p.valid_until)}` : ""}
                            </p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-sm font-bold text-[#a97c1c]">{peso(p.price)}</span>
                              <Badge tone={st.tone}>{st.label}</Badge>
                              {p.upcomingBookings > 0 && <span className="text-[11px] text-ink/45">{p.upcomingBookings} booked</span>}
                            </div>
                          </div>
                          <button
                            role="switch"
                            aria-checked={p.is_active}
                            aria-label={`${p.title} at ${b.name}: ${p.is_active ? "on" : "off"}`}
                            disabled={busy === cellKey}
                            onClick={() =>
                              p.is_active
                                ? setAsk({ kind: "off", promo: p })
                                : run(cellKey, { action: "toggle", promoId: p.id, active: true }, `${p.title} is on at ${b.name}.`)
                            }
                            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${p.is_active ? "bg-green-500" : "bg-ink/20"} disabled:opacity-50`}
                          >
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.is_active ? "left-[18px]" : "left-0.5"}`} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {list.length === 0 && (
                    <li className="rounded-xl border-2 border-dashed border-ink/10 px-3 py-6 text-center text-xs text-ink/35">No promos match</li>
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
          <p className="text-sm font-semibold text-ink">{dragged?.title}</p>
          <p className="text-xs text-ink/50">Drop on a branch</p>
        </div>
      )}

      {promos && view === "table" && (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/45">
                <th className="px-4 py-3 font-semibold">Promo</th>
                {ctx.branches.map((b) => (
                  <th key={b.id} className="px-3 py-3 font-semibold">{b.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={r.key}>
                  <tr className="border-b border-ink/5 align-top">
                    <td className="px-4 py-3">
                      <p className="flex items-start gap-1.5 font-medium text-ink">
                        <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral-dark" /> {r.title}
                      </p>
                      <p className="pl-5 text-xs text-ink/50">
                        {[r.category, r.any.badge].filter(Boolean).join(" · ") || "Promo"}
                        {r.any.valid_until ? ` · until ${day(r.any.valid_until)}` : ""}
                        {r.any.services.length ? ` · ${r.any.services.length} services` : ""}
                      </p>
                    </td>
                    {ctx.branches.map((b) => {
                      const p = r.byBranch.get(b.id);
                      const cellKey = `${r.key}-${b.id}`;
                      if (!p) {
                        return (
                          <td key={b.id} className="px-3 py-3">
                            <p className="text-xs text-ink/40">Not here</p>
                            <button
                              disabled={busy === cellKey}
                              onClick={() => setAsk({ kind: "copy", promo: r.any, to: b.id })}
                              className="mt-1 flex items-center gap-1 text-xs font-semibold text-coral-dark hover:underline disabled:opacity-50"
                            >
                              {busy === cellKey ? <Spinner /> : <Copy className="h-3 w-3" />} Copy here
                            </button>
                          </td>
                        );
                      }
                      const st = promoState(p, today);
                      // Move only where it isn't already live (otherwise it would just switch off here).
                      const others = ctx.branches.filter((x) => x.id !== b.id && !r.byBranch.get(x.id)?.is_active);
                      return (
                        <td key={b.id} className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              role="switch"
                              aria-checked={p.is_active}
                              aria-label={`${r.title} at ${b.name}: ${p.is_active ? "on" : "off"}`}
                              disabled={busy === cellKey}
                              onClick={() =>
                                p.is_active
                                  ? setAsk({ kind: "off", promo: p })
                                  : run(cellKey, { action: "toggle", promoId: p.id, active: true }, `${r.title} is on at ${b.name}.`)
                              }
                              className={`relative h-5 w-9 shrink-0 rounded-full transition ${p.is_active ? "bg-green-500" : "bg-ink/20"} disabled:opacity-50`}
                            >
                              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.is_active ? "left-[18px]" : "left-0.5"}`} />
                            </button>
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {busy === cellKey && <Spinner />}
                          </div>
                          <p className="mt-1 text-xs text-ink/50">
                            {peso(p.price)}
                            {p.price_medium || p.price_long ? ` – ${peso(p.price_long ?? p.price_medium)}` : ""}
                            {p.upcomingBookings ? ` · ${p.upcomingBookings} booked` : ""}
                          </p>
                          {p.is_active &&
                            others.map((o) => (
                              <button
                                key={o.id}
                                onClick={() => setAsk({ kind: "move", promo: p, to: o.id })}
                                className="mt-1 flex items-center gap-1 text-xs font-semibold text-coral-dark hover:underline"
                              >
                                <ArrowRight className="h-3 w-3" /> Move to {o.name.split(" ")[0] === "One" ? o.name.split(" ").slice(0, 2).join(" ") : o.name.split(" ")[0]}
                              </button>
                            ))}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={ctx.branches.length + 1} className="px-4 py-8 text-center text-sm text-ink/45">No promos match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(() => {
        const p = detailId ? (promos ?? []).find((x) => x.id === detailId) : null;
        if (!p) return null;
        const st = promoState(p, today);
        const row = rowOf(p);
        const discount =
          p.discount_type === "percent" ? `${p.discount_value}% off`
          : p.discount_type === "fixed" ? `₱${p.discount_value} off`
          : p.discount_type === "bogo" ? "Buy one, get one"
          : p.discount_value || null;
        return (
          <DetailDrawer
            title={p.title}
            subtitle={
              <>
                at {branchName(p.branch_id)} <Badge tone={st.tone}>{st.label}</Badge>
              </>
            }
            onClose={() => setDetailId(null)}
          >
            <DetailSection label="Description">
              {p.description?.trim() ? <p className="whitespace-pre-line">{p.description}</p> : <span className="text-ink/40">No description yet.</span>}
            </DetailSection>
            <DetailRows
              rows={[
                ["Price", p.price_medium || p.price_long ? `Short ${peso(p.price)} · Medium ${peso(p.price_medium)} · Long ${peso(p.price_long)}` : peso(p.price)],
                ...(discount ? ([["Discount", discount]] as [string, string][]) : []),
                ["Category", [p.category, p.department].filter(Boolean).join(" · ") || "—"],
                ["Badge", p.badge || "—"],
                ["Runs", p.valid_from || p.valid_until ? `${p.valid_from ? day(p.valid_from) : "now"} – ${p.valid_until ? day(p.valid_until) : "no end"}` : "No end date"],
                ["Upcoming bookings", String(p.upcomingBookings)],
              ]}
            />
            <DetailSection label={`Included services · ${p.services.length}`}>
              {p.services.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {p.services.map((s) => (
                    <li key={s} className="rounded-full bg-blush px-2.5 py-1 text-xs font-semibold text-ink">{s}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink/45">Not linked to specific services.</span>
              )}
            </DetailSection>
            <DetailSection label="At each branch">
              <ul className="space-y-1">
                {ctx.branches.map((b) => {
                  const there = row?.byBranch.get(b.id);
                  const s = there ? promoState(there, today) : null;
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-2">
                      <span>{b.name}</span>
                      {s ? <Badge tone={s.tone}>{s.label}</Badge> : <Badge tone="gray">Not here</Badge>}
                    </li>
                  );
                })}
              </ul>
            </DetailSection>
            <p className="text-xs text-ink/45">Edit the details in Branches &amp; Services → Promotions.</p>
          </DetailDrawer>
        );
      })()}

      {ask && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 px-4" onClick={() => setAsk(null)}>
          <div role="dialog" aria-modal="true" aria-label="Confirm promo change" className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            {ask.kind === "off" ? (
              <>
                <h2 className="font-semibold text-ink">Switch off “{ask.promo.title}” at {branchName(ask.promo.branch_id)}?</h2>
                <p className="mt-1 text-sm text-ink/60">Clients won&apos;t see or book it there.</p>
                {ask.promo.upcomingBookings > 0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {ask.promo.upcomingBookings} upcoming booking{ask.promo.upcomingBookings === 1 ? " keeps" : "s keep"} the promo and its price.
                  </p>
                )}
              </>
            ) : ask.kind === "drop" ? (
              <>
                <h2 className="font-semibold text-ink">
                  “{ask.promo.title}” → {branchName(ask.to)}
                </h2>
                <p className="mt-1 text-sm text-ink/60">
                  Same price, dates and details. Bookings already made keep their promo.{ask.promo.services.length ? " Its services must also be offered there." : ""}
                </p>
              </>
            ) : (
              <>
                <h2 className="font-semibold text-ink">
                  {ask.kind === "move" ? "Move" : "Copy"} “{ask.promo.title}” to {branchName(ask.to)}?
                </h2>
                <p className="mt-1 text-sm text-ink/60">
                  {ask.kind === "move"
                    ? `It goes live at ${branchName(ask.to)} and is switched off at ${branchName(ask.promo.branch_id)}. Bookings already made keep it.`
                    : `A copy goes live at ${branchName(ask.to)} with the same price, dates and details.`}
                  {ask.promo.services.length ? " Its services must also be offered there." : ""}
                </p>
              </>
            )}
            {ask.kind === "drop" ? (
              <div className="mt-4 space-y-2">
                <button
                  disabled={!!busy}
                  onClick={() => run(`${ask.promo.title.toLowerCase().trim()}-${ask.to}`, { action: "copy", promoId: ask.promo.id, branchId: ask.to }, `${ask.promo.title} copied to ${branchName(ask.to)}.`)}
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-ink/10 p-3 text-left transition hover:border-coral hover:bg-blush disabled:opacity-50"
                >
                  <Copy className="mt-0.5 h-4 w-4 shrink-0 text-coral-dark" />
                  <span>
                    <span className="block font-semibold text-ink">Copy</span>
                    <span className="block text-xs text-ink/55">Live at both {branchName(ask.promo.branch_id)} and {branchName(ask.to)}.</span>
                  </span>
                </button>
                <button
                  disabled={!!busy || !ask.promo.is_active}
                  onClick={() => run(`${ask.promo.title.toLowerCase().trim()}-${ask.to}`, { action: "copy", promoId: ask.promo.id, branchId: ask.to, move: true }, `${ask.promo.title} moved to ${branchName(ask.to)}.`)}
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-ink/10 p-3 text-left transition hover:border-coral hover:bg-blush disabled:opacity-50"
                >
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-coral-dark" />
                  <span>
                    <span className="block font-semibold text-ink">Move</span>
                    <span className="block text-xs text-ink/55">
                      {ask.promo.is_active ? `Live at ${branchName(ask.to)}, switched off at ${branchName(ask.promo.branch_id)}.` : "It's already off here — use Copy."}
                    </span>
                  </span>
                </button>
                <button onClick={() => setAsk(null)} className="w-full rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70">
                  Cancel
                </button>
              </div>
            ) : (
            <div className="mt-4 flex gap-2">
              <button onClick={() => setAsk(null)} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70">
                Cancel
              </button>
              <button
                disabled={!!busy}
                onClick={() =>
                  ask.kind === "off"
                    ? run(`${ask.promo.title.toLowerCase().trim()}-${ask.promo.branch_id}`, { action: "toggle", promoId: ask.promo.id, active: false }, `${ask.promo.title} is off at ${branchName(ask.promo.branch_id)}.`)
                    : run(
                        `${ask.promo.title.toLowerCase().trim()}-${ask.to}`,
                        { action: "copy", promoId: ask.promo.id, branchId: ask.to, move: ask.kind === "move" },
                        `${ask.promo.title} ${ask.kind === "move" ? "moved" : "copied"} to ${branchName(ask.to)}.`
                      )
                }
                className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {ask.kind === "off" ? "Switch off" : ask.kind === "move" ? "Move" : "Copy"}
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
