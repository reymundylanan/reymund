"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ArrowRight, Bell, CalendarClock, ChevronDown, ChevronRight, Crown, FolderOpen, GripVertical, Home, Search, Wallet } from "lucide-react";
import { formatDay, formatTime, isBranchActive, toMinutes, toTime, type ClientCard, type Context } from "@/lib/multiBranch/engine";
import type { ClientBooking } from "@/lib/multiBranch/clientTransfer";
import type { Channels } from "@/lib/multiBranch/channels";
import { Avatar, Badge, Spinner, TONE, postJson, type Tone } from "./ui";
import { useCardDrag, type DragItem } from "./useCardDrag";
import { Empty } from "./BoardColumn";
import { Panel, Side, type Done } from "./TransferPreview";

const NONE = "none";
const peso = (n: number) => `₱${Math.round(n).toLocaleString()}`;
const SOURCE: Record<ClientCard["branchSource"], string> = {
  home: "Home branch",
  next_visit: "Next visit here",
  last_visit: "Last visited here",
  none: "No branch yet",
};

/** Clients (accounts and walk-ins) by branch; drag one to another branch to
 * transfer them — their records go with them. */
export default function ClientsBoard({ ctx, refreshKey, onDone }: { ctx: Context; refreshKey: number; onDone: Done }) {
  const [clients, setClients] = useState<ClientCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "account" | "walkin" | "upcoming">("all");
  const [preview, setPreview] = useState<{ key: string; toBranchId: string | null } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/multi-branch/clients")
      .then(async (r) => {
        const json = (await r.json()) as { clients?: ClientCard[]; error?: string };
        if (!alive) return;
        if (!r.ok) setError(json.error ?? "Couldn't load clients.");
        else {
          setError(null);
          setClients(json.clients ?? []);
        }
      })
      .catch(() => alive && setError("Couldn't load clients."));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (clients ?? []).filter(
      (c) =>
        (type === "all" || (type === "account" ? !!c.clientId : type === "walkin" ? !c.clientId : c.upcoming > 0)) &&
        (!s || `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(s))
    );
  }, [clients, q, type]);

  const columns = useMemo(() => {
    const map = new Map<string, ClientCard[]>(ctx.branches.map((b) => [b.id, []]));
    map.set(NONE, []);
    for (const c of shown) map.get(c.branchId && map.has(c.branchId) ? c.branchId : NONE)!.push(c);
    for (const list of map.values()) list.sort((a, b) => (b.upcoming > 0 ? 1 : 0) - (a.upcoming > 0 ? 1 : 0) || a.name.localeCompare(b.name));
    return map;
  }, [shown, ctx.branches]);

  const onDrop = useCallback(
    (item: DragItem, key: string) => {
      if (key === NONE) return;
      setPreview({ key: item.id, toBranchId: key });
    },
    []
  );
  const { ghost, over, scroller, cardProps, columnRef, dragging } = useCardDrag(onDrop);
  const draggingClient = dragging ? clients?.find((c) => c.key === dragging.id) : null;
  const hint = (branchId: string): { tone: Tone; text: string } | null => {
    if (!draggingClient) return null;
    const b = ctx.branches.find((x) => x.id === branchId);
    if (!isBranchActive(b)) return { tone: "red", text: "Branch isn't open" };
    if (draggingClient.homeBranchId === branchId && draggingClient.upcoming === 0) return { tone: "red", text: "Already their home branch" };
    return { tone: "green", text: "Drop to review the transfer" };
  };

  const previewClient = preview ? clients?.find((c) => c.key === preview.key) : null;
  const total = clients?.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50 focus-within:border-coral">
          <Search className="h-4 w-4 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client name or phone" className="w-full bg-transparent text-ink outline-none placeholder:text-ink/40" />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Client type" className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70">
          <option value="all">All clients ({total})</option>
          <option value="account">With an account</option>
          <option value="walkin">Walk-ins</option>
          <option value="upcoming">With upcoming bookings</option>
        </select>
        <p className="w-full text-xs text-ink/50">
          Clients with bookings and walk-in visits, under their home branch (or where they visit). Drag one onto another branch to transfer them — their visit
          history, payments, GlowPoints, vouchers and reviews go with them, and you choose which upcoming bookings move too.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!clients && !error && (
        <p className="flex items-center gap-2 text-sm text-ink/50">
          <Spinner /> Loading clients…
        </p>
      )}

      {clients && (
        <div className={`grid gap-4 ${preview ? "lg:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
          <div ref={scroller} className="scrollbar-hidden -mx-1 flex min-w-0 snap-x gap-4 overflow-x-auto px-1 pb-4">
            {[...ctx.branches.map((b) => b.id), NONE].map((id) => {
              const list = columns.get(id) ?? [];
              if (id === NONE && list.length === 0) return null;
              const b = ctx.branches.find((x) => x.id === id);
              const h = id === NONE ? null : hint(id);
              const isCollapsed = collapsed.has(id);
              const walkIns = list.filter((c) => !c.clientId).length;
              const upcoming = list.filter((c) => c.upcoming > 0).length;
              const toggle = () =>
                setCollapsed((s) => {
                  const n = new Set(s);
                  if (n.has(id)) n.delete(id);
                  else n.add(id);
                  return n;
                });
              return (
                <section
                  key={id}
                  ref={id === NONE ? undefined : columnRef(id)}
                  aria-label={b?.name ?? "No branch yet"}
                  className={`flex h-[min(44rem,calc(100dvh-11rem))] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border-2 transition ${
                    isCollapsed ? "w-[4.5rem]" : "w-[18.5rem] sm:w-[20rem]"
                  } ${h ? `${TONE[h.tone].ring} ${TONE[h.tone].soft} shadow-lg` : id === NONE ? "border-dashed border-ink/15 bg-white/50" : "border-transparent bg-white shadow-sm"}`}
                >
                  <header className={`shrink-0 border-b border-ink/5 ${isCollapsed ? "px-2 py-3" : "p-3"}`}>
                    <div className={`flex gap-2 ${isCollapsed ? "flex-col items-center" : "items-center"}`}>
                      <button
                        onClick={toggle}
                        aria-expanded={!isCollapsed}
                        aria-label={isCollapsed ? `Expand ${b?.name ?? "No branch yet"}` : `Collapse ${b?.name ?? "No branch yet"}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose text-coral-dark transition hover:bg-champagne"
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      {isCollapsed ? (
                        <>
                          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-bold text-ink/70">{list.length}</span>
                          <p className="mt-1 text-xs font-semibold text-ink [writing-mode:vertical-rl]">{b?.name ?? "No branch yet"}</p>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate font-semibold text-ink">{b?.name ?? "No branch yet"}</h2>
                            <p className="text-xs text-ink/45">{id === NONE ? "No home branch or visit yet" : "Home branch or where they visit"}</p>
                          </div>
                          <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-sm font-bold text-ink/70">{list.length}</span>
                        </>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                        <MiniStat label="Accounts" value={list.length - walkIns} tone="blue" />
                        <MiniStat label="Walk-ins" value={walkIns} tone="gray" />
                        <MiniStat label="Upcoming" value={upcoming} tone="amber" />
                      </div>
                    )}
                    {!isCollapsed && over === id && h && <p className={`mt-2 rounded-lg px-2 py-1.5 text-xs font-semibold ${TONE[h.tone].badge}`}>{h.text}</p>}
                  </header>

                  {!isCollapsed && (
                    <ul className="min-h-0 flex-1 [scrollbar-color:rgba(201,168,74,0.5)_transparent] [scrollbar-width:thin] space-y-2 overflow-y-auto overscroll-contain p-2.5">
                      {list.map((c) => (
                        <li
                          key={c.key}
                          {...cardProps({ kind: "client", id: c.key })}
                          className={`group relative cursor-grab select-none rounded-xl border bg-white p-2.5 transition active:cursor-grabbing ${
                            dragging?.id === c.key ? "opacity-30" : "hover:-translate-y-0.5 hover:border-coral/50 hover:shadow-md"
                          } ${c.upcoming > 0 ? "border-amber-200" : "border-ink/10"}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span data-grip className="-my-2 -ml-1 touch-none py-2 pl-0.5 text-ink/20 group-hover:text-ink/45" aria-hidden>
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <span className="relative shrink-0">
                              {c.avatarUrl ? (
                                <Avatar name={c.name} url={c.avatarUrl} size={40} />
                              ) : (
                                <span
                                  className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold ${
                                    c.clientId ? "bg-blue-100 text-blue-700" : "bg-champagne text-coral-dark"
                                  }`}
                                >
                                  {initials(c.name)}
                                </span>
                              )}
                              {c.vip && (
                                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-white shadow" title="VIP">
                                  <Crown className="h-3 w-3 text-coral-dark" />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                              <span className="flex items-center gap-1.5 text-xs text-ink/50">
                                <span className={`rounded px-1 text-[10px] font-bold uppercase tracking-wide ${c.clientId ? "bg-blue-50 text-blue-700" : "bg-ink/5 text-ink/55"}`}>
                                  {c.clientId ? "Account" : "Walk-in"}
                                </span>
                                <span className="truncate">{c.phone ?? "No phone"}</span>
                              </span>
                            </span>
                            <button
                              onClick={() => setPreview({ key: c.key, toBranchId: null })}
                              aria-label={`Transfer ${c.name}`}
                              title="Transfer client"
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/35 transition hover:bg-blush hover:text-coral-dark"
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="mt-2 grid grid-cols-3 divide-x divide-ink/5 rounded-lg bg-cream/70 py-1.5 text-center">
                            <Fact label="Visits" value={String(c.visits)} />
                            <Fact label="Spent" value={peso(c.spend)} />
                            <Fact label={c.clientId ? "Points" : "Last"} value={c.clientId ? String(c.points) : c.lastVisit ? shortDay(c.lastVisit) : "—"} />
                          </div>

                          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                            <span className="flex items-center gap-1 truncate text-ink/45">
                              {c.branchSource === "home" ? <Home className="h-3 w-3 shrink-0" /> : <CalendarClock className="h-3 w-3 shrink-0" />}
                              {SOURCE[c.branchSource]}
                              {c.clientId && c.lastVisit ? ` · last ${shortDay(c.lastVisit)}` : ""}
                            </span>
                            {c.upcoming > 0 && <Badge tone="amber">{c.upcoming} upcoming</Badge>}
                          </div>
                        </li>
                      ))}
                      {list.length === 0 && <Empty>{q || type !== "all" ? "No clients match" : "No clients here"}</Empty>}
                    </ul>
                  )}
                  {!isCollapsed && list.length > 4 && (
                    <p className="shrink-0 border-t border-ink/5 px-3 py-1.5 text-center text-[11px] text-ink/40">{list.length} clients · scroll for more</p>
                  )}
                </section>
              );
            })}
          </div>

          {previewClient && preview && (
            <ClientPreview
              key={`${previewClient.key}-${preview.toBranchId}`}
              ctx={ctx}
              client={previewClient}
              initialToBranchId={preview.toBranchId}
              onClose={() => setPreview(null)}
              onDone={(text, logId) => {
                setPreview(null);
                onDone(text, logId);
              }}
            />
          )}
        </div>
      )}

      {ghost && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[90] rounded-xl border border-coral bg-white p-2.5 shadow-2xl"
          style={{ width: ghost.w, transform: `translate(${ghost.x - ghost.ox}px, ${ghost.y - ghost.oy}px) rotate(2deg)` }}
        >
          <p className="text-sm font-semibold text-ink">{clients?.find((c) => c.key === ghost.item.id)?.name}</p>
          <p className="text-xs text-ink/50">Drop on a branch</p>
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function shortDay(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={`rounded-lg py-1 ${TONE[tone].soft}`}>
      <p className={`text-sm font-bold ${tone === "gray" ? "text-ink" : TONE[tone].badge.split(" ")[1]}`}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink/45">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-1">
      <p className="truncate text-xs font-bold text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-ink/40">{label}</p>
    </div>
  );
}

type Preview = { client: ClientCard; bookings: ClientBooking[]; channels: Channels };

function ClientPreview({
  ctx,
  client,
  initialToBranchId,
  onClose,
  onDone,
}: {
  ctx: Context;
  client: ClientCard;
  initialToBranchId: string | null;
  onClose: () => void;
  onDone: Done;
}) {
  const options = ctx.branches.filter((b) => isBranchActive(b) && (b.id !== client.homeBranchId || client.upcoming > 0));
  const [toBranchId, setToBranchId] = useState(initialToBranchId ?? options.find((b) => b.id !== client.branchId)?.id ?? options[0]?.id ?? "");
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch for the chosen destination
    setLoading(true);
    postJson<Preview>("/api/admin/multi-branch/preview", { type: "client", key: client.key, toBranchId })
      .then((r) => {
        if (!alive) return;
        setData(r);
        setError(null);
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [client.key, toBranchId]);

  const branchName = (id: string | null) => ctx.branches.find((b) => b.id === id)?.name ?? "No branch";
  const staffName = (id: string | null) => (id ? ctx.staff.find((s) => s.id === id)?.name ?? "—" : "Any available");
  const dest = ctx.branches.find((b) => b.id === toBranchId);
  const movable = (data?.bookings ?? []).filter((b) => !b.alreadyThere && b.proposal);
  const moves = movable.filter((b) => !skip.has(b.appointment.id));
  const stuck = (data?.bookings ?? []).filter((b) => !b.alreadyThere && !b.proposal);
  const isAccount = !!client.clientId;
  const canConfirm = !loading && !!reason.trim() && (isAccount ? client.homeBranchId !== toBranchId || moves.length > 0 : moves.length > 0);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const res = await postJson<{ logId: string }>("/api/admin/multi-branch/transfer-client", {
        key: client.key,
        toBranchId,
        reason,
        moves: moves.map((b) => ({ appointmentId: b.appointment.id, staffId: b.proposal!.staffId, date: b.proposal!.date, start: toTime(b.proposal!.start) })),
      });
      onDone(
        `${client.name} transferred to ${dest?.name}${moves.length ? ` with ${moves.length} booking${moves.length === 1 ? "" : "s"}` : ""}.`,
        res.logId
      );
    } catch (e) {
      const err = e as Error & { data?: { bookings?: ClientBooking[] } };
      setError(err.message);
      if (err.data?.bookings) setData((d) => (d ? { ...d, bookings: err.data!.bookings! } : d));
      setConfirming(false);
    }
    setSaving(false);
  }

  return (
    <Panel title={`Transfer ${client.name}`} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar name={client.name} url={client.avatarUrl} size={44} />
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-semibold text-ink">
            {client.name} {client.vip && <Crown className="h-4 w-4 text-coral-dark" />}
          </p>
          <p className="text-sm text-ink/55">
            {isAccount ? "Client account" : "Walk-in (no account)"} · {client.phone ?? "no phone"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side label={client.homeBranchId ? "Home branch" : "Currently"} tone="old">
          <p className="font-semibold">{branchName(client.branchId)}</p>
          <p className="text-xs text-ink/50">{SOURCE[client.branchSource]}</p>
        </Side>
        <ArrowRight className="h-4 w-4 text-coral-dark" />
        <Side label="To" tone="new">
          <select value={toBranchId} onChange={(e) => { setToBranchId(e.target.value); setSkip(new Set()); }} aria-label="Destination branch" className="w-full bg-transparent font-semibold outline-none">
            {options.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Side>
      </div>

      <div className="mt-4 rounded-xl bg-cream px-3 py-2.5 text-xs text-ink/70">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <FolderOpen className="h-3.5 w-3.5 text-coral-dark" /> Records that go with them
        </p>
        <p className="mt-1">
          {client.visits} past visit{client.visits === 1 ? "" : "s"} · {peso(client.spend)} paid
          {isAccount ? ` · ${client.points} GlowPoints` : ""} · {client.upcoming} upcoming
        </p>
        <p className="mt-1">
          Their visit history, payments{isAccount ? ", GlowPoints, vouchers and reviews" : ""} stay linked to {isAccount ? "their account" : "them"} and are
          visible at {dest?.name ?? "the new branch"}. Past visits keep the branch where they happened, so each branch&apos;s sales and reports stay accurate.
        </p>
        {!isAccount && (
          <p className="mt-1 text-amber-800">
            Walk-ins have no account to hold a home branch — this moves their upcoming visits. Link them to an account at the front desk to keep a home branch.
          </p>
        )}
      </div>

      <div className="mt-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          Upcoming bookings {loading && <Spinner className="text-coral" />}
        </h3>
        {!loading && data && data.bookings.length === 0 && <p className="text-sm text-ink/50">None — only {isAccount ? "the home branch" : "their record"} changes.</p>}
        <ul className="space-y-2">
          {(data?.bookings ?? []).map(({ appointment: a, proposal, alreadyThere }) => {
            const start = toMinutes(a.start);
            const on = !!proposal && !skip.has(a.id);
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
                    <span className="block font-medium text-ink">{a.serviceLabel}</span>
                    <span className="block text-xs text-ink/55">
                      Now: {branchName(a.branchId)} · {formatDay(a.date, ctx.today)} {formatTime(start)} · {staffName(a.professionalId)}
                    </span>
                    {alreadyThere ? (
                      <span className="block text-xs text-green-700">Already at {dest?.name}.</span>
                    ) : proposal ? (
                      <span className="block text-xs font-semibold text-green-700">
                        → {dest?.name} · {formatDay(proposal.date, ctx.today)} {formatTime(proposal.start)} · {staffName(proposal.staffId)}
                        {proposal.start !== start ? " (nearest free time)" : ""}
                      </span>
                    ) : (
                      <span className="block text-xs text-red-700">
                        No valid slot at {dest?.name} that day — it stays at {branchName(a.branchId)}; reschedule it from the board.
                      </span>
                    )}
                    {a.paid && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink/50">
                        <Wallet className="h-3 w-3" /> Payment stays with the booking
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {stuck.length > 0 && <p className="mt-2 text-xs text-ink/50">Bookings without a valid slot are never forced — they stay as booked.</p>}
      </div>

      {moves.length > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-cream px-3 py-2 text-xs text-ink/70">
          <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral-dark" />
          <span>
            <b>Client notification</b> for each moved booking: {data?.channels.summary ?? "…"} — only after you confirm.
          </span>
        </p>
      )}

      <label className="mt-4 block">
        <span className="text-sm font-medium text-ink/70">Reason *</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. The client moved closer to this branch"
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-coral focus:outline-none"
        />
      </label>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {confirming ? (
        <div className="mt-4 rounded-xl border-2 border-coral bg-blush p-3">
          <p className="text-sm text-ink">
            Transfer <b>{client.name}</b> to <b>{dest?.name}</b>
            {moves.length ? ` and move ${moves.length} booking${moves.length === 1 ? "" : "s"}` : ""}? If any booking can&apos;t be moved, nothing is changed.
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
            title={!reason.trim() ? "Add a reason" : !isAccount && moves.length === 0 ? "Choose at least one visit to move" : undefined}
            className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm transfer
          </button>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1 text-[11px] text-ink/40">
        <CalendarClock className="h-3 w-3" /> Every booking is checked again on the server when you confirm.
      </p>
    </Panel>
  );
}
