"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, Search, Tag } from "lucide-react";
import type { Context } from "@/lib/multiBranch/engine";
import { Badge, Spinner, postJson, type Tone } from "./ui";

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
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  services: string[];
  upcomingBookings: number;
};
type Row = { key: string; title: string; category: string | null; any: Promo; byBranch: Map<string, Promo> };
type Ask = { kind: "off"; promo: Promo } | { kind: "move" | "copy"; promo: Promo; to: string };

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
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Promo status" className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70">
          <option value="all">All promos</option>
          <option value="live">Live ({counts.live})</option>
          <option value="scheduled">Scheduled</option>
          <option value="off">Off ({counts.off})</option>
          <option value="expired">Expired ({counts.expired})</option>
        </select>
        <p className="w-full text-xs text-ink/50">
          Switch a promo on or off at each branch, copy it to a branch that doesn&apos;t have it, or move it (copied there, switched off here). Bookings already made
          with a promo keep it. Edit a promo&apos;s details in Branches &amp; Services → Promotions.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!promos && !error && (
        <p className="flex items-center gap-2 text-sm text-ink/50">
          <Spinner /> Loading promos…
        </p>
      )}

      {promos && (
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
          </div>
        </div>
      )}
    </div>
  );
}
