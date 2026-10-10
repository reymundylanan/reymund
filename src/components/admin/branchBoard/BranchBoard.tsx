"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftRight, Building2, CalendarOff, GripVertical, Home, Plane, Search, UserCog, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getUpcomingApprovedLeaves } from "@/lib/supabase/queries/leaveRequests";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { NO_BRANCH, departmentSummary, formatDateRuns, groupByColumn } from "@/lib/branchBoard";
import AdminTransferModal from "@/components/admin/users/AdminTransferModal";
import type { StaffUser } from "@/components/admin/users/types";

type Branch = { id: string; name: string; address: string | null };
type Kind = "staff" | "accounts";
type Card = {
  id: string;
  branchId: string | null;
  name: string;
  /** Department (staff) or role (accounts). */
  sub: string;
  avatarUrl: string | null;
};
/** An approved lend: the staff member works at `branchId` on `dates`. */
type Lend = { staffId: string; branchId: string; dates: string[] };
type Drop = { kind: Kind; card: Card; to: string };
type Toast = { text: string; undo?: () => Promise<void> };

const ROLE_LABEL: Record<string, string> = { front_desk: "Front desk", specialist: "Specialist" };

/** `only`: show one kind without the switch (Multi-Branch uses it for accounts). */
export default function BranchBoard({ only }: { only?: Kind } = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<Kind>(only ?? "staff");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Card[]>([]);
  const [accounts, setAccounts] = useState<Card[]>([]);
  const [lends, setLends] = useState<Lend[]>([]);
  const [leaves, setLeaves] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("All");
  const [drop, setDrop] = useState<Drop | null>(null);
  const [lendTarget, setLendTarget] = useState<Drop | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const loadStaff = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("staff_members")
      .select("id, full_name, department, branch_id, avatar_url")
      .order("full_name");
    if (err) setError(err.message);
    type Row = { id: string; full_name: string; department: string | null; branch_id: string | null; avatar_url: string | null };
    setStaff(
      ((data as Row[]) ?? []).map((r) => ({ id: r.id, branchId: r.branch_id, name: r.full_name, sub: r.department ?? "", avatarUrl: r.avatar_url }))
    );
  }, [supabase]);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const json = (await res.json()) as { users?: StaffUser[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't load accounts.");
      setAccounts(
        (json.users ?? [])
          .filter((u) => u.role === "front_desk" || u.role === "specialist")
          .map((u) => ({ id: u.id, branchId: u.branchId ?? null, name: u.fullName, sub: ROLE_LABEL[u.role] ?? u.role, avatarUrl: u.avatarUrl ?? null }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load accounts.");
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    const today = toDateKey(new Date());
    const [{ data }, leaveRows] = await Promise.all([
      supabase.from("branch_transfer_requests").select("staff_member_id, target_branch_id, dates").eq("status", "approved"),
      getUpcomingApprovedLeaves(supabase),
    ]);
    type Row = { staff_member_id: string; target_branch_id: string; dates: string[] };
    setLends(
      ((data as Row[]) ?? [])
        .map((r) => ({ staffId: r.staff_member_id, branchId: r.target_branch_id, dates: r.dates.filter((d) => d >= today) }))
        .filter((l) => l.dates.length > 0)
    );
    const byStaff: Record<string, string[]> = {};
    for (const r of leaveRows) {
      const upcoming = r.dates.filter((d) => d >= today);
      if (upcoming.length) byStaff[r.staff_member_id] = [...(byStaff[r.staff_member_id] ?? []), ...upcoming];
    }
    setLeaves(byStaff);
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("branches").select("id, name, address").order("name"),
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the loaders set state after their awaits
      loadStaff(),
      loadAccounts(),
      loadSchedules(),
    ]).then(([{ data, error: err }]) => {
      if (!alive) return;
      if (err) setError(err.message);
      setBranches((data as Branch[]) ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [supabase, loadStaff, loadAccounts, loadSchedules]);

  // Toasts fade on their own.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const cards = kind === "staff" ? staff : accounts;
  const departments = useMemo(() => ["All", ...[...new Set(staff.map((s) => s.sub || "Other"))].sort()], [staff]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (!q || c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)) &&
        (kind !== "staff" || dept === "All" || (c.sub || "Other") === dept)
    );
  }, [cards, query, dept, kind]);
  const columns = useMemo(() => groupByColumn(visible, branches.map((b) => b.id)), [visible, branches]);
  const allColumns = useMemo(() => groupByColumn(cards, branches.map((b) => b.id)), [cards, branches]);
  const branchName = useCallback((id: string | null) => branches.find((b) => b.id === id)?.name ?? "No branch", [branches]);

  // ── Moving ──
  async function setBranch(k: Kind, id: string, branchId: string | null): Promise<string | null> {
    if (k === "staff") {
      const { error: err } = await supabase.from("staff_members").update({ branch_id: branchId }).eq("id", id);
      return err?.message ?? null;
    }
    const res = await fetch("/api/admin/move-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, branchId }),
    });
    if (res.ok) return null;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't move the account.";
  }

  function patch(k: Kind, id: string, branchId: string | null) {
    const apply = (list: Card[]) => list.map((c) => (c.id === id ? { ...c, branchId } : c));
    if (k === "staff") setStaff(apply);
    else setAccounts(apply);
  }

  async function moveForGood(d: Drop) {
    const from = d.card.branchId;
    const to = d.to === NO_BRANCH ? null : d.to;
    patch(d.kind, d.card.id, to);
    setDrop(null);
    const err = await setBranch(d.kind, d.card.id, to);
    if (err) {
      patch(d.kind, d.card.id, from);
      setToast({ text: `Couldn't move ${d.card.name}: ${err}` });
      return;
    }
    setToast({
      text: to ? `${d.card.name} now belongs to ${branchName(to)}.` : `${d.card.name} has no branch now.`,
      undo: async () => {
        patch(d.kind, d.card.id, from);
        setToast(null);
        const undoErr = await setBranch(d.kind, d.card.id, from);
        if (undoErr) {
          patch(d.kind, d.card.id, to);
          setToast({ text: `Couldn't undo: ${undoErr}` });
        } else setToast({ text: `${d.card.name} is back at ${branchName(from)}.` });
      },
    });
  }

  function requestMove(k: Kind, card: Card, to: string) {
    if ((card.branchId ?? NO_BRANCH) === to) return;
    setDrop({ kind: k, card, to });
  }

  // ── Dragging (pointer events: works with a mouse, pen or finger) ──
  const columnEls = useRef(new Map<string, HTMLElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ card: Card; x: number; y: number; w: number; ox: number; oy: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const pending = useRef<{ card: Card; x: number; y: number; el: HTMLElement; started: boolean } | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const columnAt = (x: number, y: number) => {
    for (const [key, el] of columnEls.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
    }
    return null;
  };

  function onCardPointerDown(e: React.PointerEvent<HTMLElement>, card: Card) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, select, a")) return;
    // Fingers drag from the grip (so the board can still be scrolled); a mouse drags the whole card.
    if (e.pointerType === "touch" && !target.closest("[data-grip]")) return;
    pending.current = { card, x: e.clientX, y: e.clientY, el: e.currentTarget, started: false };
    pointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLElement>) {
    const p = pending.current;
    if (!p) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (!p.started) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      p.started = true;
      const r = p.el.getBoundingClientRect();
      setGhost({ card: p.card, x: e.clientX, y: e.clientY, w: r.width, ox: p.x - r.left, oy: p.y - r.top });
    }
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    setOver(columnAt(e.clientX, e.clientY));
  }

  function endDrag(e: React.PointerEvent<HTMLElement>, cancelled = false) {
    const p = pending.current;
    pending.current = null;
    if (!p?.started) return;
    const to = cancelled ? null : columnAt(e.clientX, e.clientY);
    setGhost(null);
    setOver(null);
    if (to) requestMove(kind, p.card, to);
  }

  // Near the board's edges while dragging, it scrolls sideways.
  const dragging = !!ghost;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const tick = () => {
      const el = scroller.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const { x, y } = pointer.current;
        const edge = 72;
        if (x < r.left + edge) el.scrollLeft -= Math.ceil((r.left + edge - x) / 6);
        else if (x > r.right - edge) el.scrollLeft += Math.ceil((x - (r.right - edge)) / 6);
        setOver(columnAt(x, y));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  const lendsInto = (branchId: string) => lends.filter((l) => l.branchId === branchId);
  const lendsOf = (staffId: string) => lends.filter((l) => l.staffId === staffId);
  const showNoBranch = (allColumns[NO_BRANCH]?.length ?? 0) > 0 || dragging;
  const columnKeys = [...branches.map((b) => b.id), ...(showNoBranch ? [NO_BRANCH] : [])];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div role="tablist" aria-label="What to arrange" className={`flex rounded-full bg-cream p-1 ${only ? "hidden" : ""}`}>
          {(
            [
              ["staff", "Staff", Users, staff.length],
              ["accounts", "Front desk", UserCog, accounts.length],
            ] as const
          ).map(([k, label, Icon, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                kind === k ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
              <span className="rounded-full bg-ink/5 px-1.5 text-xs text-ink/50">{n}</span>
            </button>
          ))}
        </div>
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50 focus-within:border-coral">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={kind === "staff" ? "Search staff or department" : "Search accounts"}
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink/40"
          />
        </label>
        {kind === "staff" && departments.length > 2 && (
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            aria-label="Department"
            className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70"
          >
            {departments.map((d) => (
              <option key={d} value={d}>
                {d === "All" ? "All departments" : d}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ink/50">
        <GripVertical className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Drag a card to another branch{kind === "staff" ? " — then choose to move them for good or lend them for some days" : ""}. On a phone, drag by the grip or use the
        <ArrowLeftRight className="mx-1 inline h-3.5 w-3.5 align-[-2px]" />button.
      </p>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-80 w-72 shrink-0 animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-ink/50">No branches yet.</p>
      ) : (
        <div ref={scroller} className="scrollbar-hidden -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-4">
          {columnKeys.map((key) => {
            const list = columns[key] ?? [];
            const total = allColumns[key]?.length ?? 0;
            const isOver = over === key;
            const branch = branches.find((b) => b.id === key);
            const visiting = kind === "staff" && branch ? lendsInto(branch.id) : [];
            return (
              <section
                key={key}
                ref={(el) => {
                  if (el) columnEls.current.set(key, el);
                  else columnEls.current.delete(key);
                }}
                aria-label={branch?.name ?? "No branch"}
                className={`flex w-[17.5rem] shrink-0 snap-start flex-col rounded-2xl border-2 p-3 transition sm:w-72 ${
                  isOver
                    ? "border-coral bg-blush shadow-lg"
                    : key === NO_BRANCH
                      ? "border-dashed border-ink/15 bg-white/50"
                      : "border-transparent bg-white shadow-sm"
                }`}
              >
                <header className="mb-3 flex items-start gap-2 px-1">
                  <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${key === NO_BRANCH ? "bg-ink/5 text-ink/40" : "bg-rose text-coral-dark"}`}>
                    {key === NO_BRANCH ? <Home className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate font-semibold text-ink">{branch?.name ?? "No branch"}</h2>
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/60">{total}</span>
                    </div>
                    <p className="truncate text-xs text-ink/45">
                      {kind === "staff"
                        ? departmentSummary(allColumns[key]?.map((c) => c.sub) ?? []) || "No staff yet"
                        : (allColumns[key]?.length ?? 0) > 0
                          ? `${allColumns[key].length} account${allColumns[key].length === 1 ? "" : "s"}`
                          : "No front desk yet"}
                    </p>
                  </div>
                </header>

                {visiting.length > 0 && (
                  <div className="mb-3 rounded-xl bg-cream px-3 py-2">
                    <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-coral-dark">
                      <Plane className="h-3 w-3" /> Visiting soon
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {visiting.slice(0, 4).map((l, i) => (
                        <li key={i} className="truncate text-xs text-ink/70">
                          <span className="font-medium text-ink">{staff.find((s) => s.id === l.staffId)?.name ?? "Staff"}</span> · {formatDateRuns(l.dates)}
                        </li>
                      ))}
                      {visiting.length > 4 && <li className="text-xs text-ink/45">+{visiting.length - 4} more</li>}
                    </ul>
                  </div>
                )}

                <ul className="flex min-h-[6rem] flex-1 flex-col gap-2">
                  {list.map((card) => {
                    const isGhost = ghost?.card.id === card.id;
                    const away = kind === "staff" ? lendsOf(card.id) : [];
                    const off = kind === "staff" ? leaves[card.id] : undefined;
                    return (
                      <li
                        key={card.id}
                        onPointerDown={(e) => onCardPointerDown(e, card)}
                        onPointerMove={onCardPointerMove}
                        onPointerUp={(e) => endDrag(e)}
                        onPointerCancel={(e) => endDrag(e, true)}
                        className={`group relative flex cursor-grab select-none items-center gap-2.5 rounded-xl border border-ink/10 bg-white p-2.5 transition active:cursor-grabbing ${
                          isGhost ? "opacity-30" : "hover:border-coral/50 hover:shadow-sm"
                        }`}
                      >
                        <span data-grip className="-my-2 -ml-1 touch-none py-2 pl-1 text-ink/25 group-hover:text-ink/45" aria-hidden>
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <CardBody card={card} />
                        <MovePicker
                          card={card}
                          options={columnKeys.filter((k) => k !== (card.branchId ?? NO_BRANCH)).map((k) => ({ key: k, label: branchName(k === NO_BRANCH ? null : k) }))}
                          onPick={(to) => requestMove(kind, card, to)}
                        />
                        {(away.length > 0 || off) && (
                          <div className="absolute -bottom-1.5 left-9 flex gap-1">
                            {away.length > 0 && (
                              <span title={away.map((l) => `${branchName(l.branchId)}: ${formatDateRuns(l.dates)}`).join("\n")} className="flex items-center gap-0.5 rounded-full bg-rose px-1.5 text-[10px] font-semibold text-coral-dark">
                                <Plane className="h-2.5 w-2.5" /> Lent out
                              </span>
                            )}
                            {off && (
                              <span title={`On leave: ${formatDateRuns(off)}`} className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                                <CalendarOff className="h-2.5 w-2.5" /> Leave
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {list.length === 0 && (
                    <li className={`grid flex-1 place-items-center rounded-xl border-2 border-dashed px-3 py-6 text-center text-xs ${isOver ? "border-coral text-coral-dark" : "border-ink/10 text-ink/35"}`}>
                      {isOver ? "Drop here" : total > 0 ? "No matches" : "Drop someone here"}
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* The card following the pointer */}
      {ghost && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[70] flex items-center gap-2.5 rounded-xl border border-coral bg-white p-2.5 shadow-2xl"
          style={{ width: ghost.w, transform: `translate(${ghost.x - ghost.ox}px, ${ghost.y - ghost.oy}px) rotate(2deg)` }}
        >
          <GripVertical className="h-4 w-4 text-coral" />
          <CardBody card={ghost.card} />
        </div>
      )}

      {drop && (
        <DropDialog
          drop={drop}
          fromName={branchName(drop.card.branchId)}
          toName={branchName(drop.to === NO_BRANCH ? null : drop.to)}
          supabase={supabase}
          onCancel={() => setDrop(null)}
          onMove={() => moveForGood(drop)}
          onLend={() => {
            setLendTarget(drop);
            setDrop(null);
          }}
        />
      )}

      {lendTarget && (
        <AdminTransferModal
          staffMemberId={lendTarget.card.id}
          staffMemberName={lendTarget.card.name}
          staffMemberDepartment={lendTarget.card.sub}
          homeBranchId={lendTarget.card.branchId}
          initialTargetBranchId={lendTarget.to}
          onClose={() => setLendTarget(null)}
          onSaved={() => {
            setToast({ text: `${lendTarget.card.name} is lent to ${branchName(lendTarget.to)}.` });
            setLendTarget(null);
            loadSchedules();
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[80] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-3 text-sm text-white shadow-xl">
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={toast.undo} className="font-semibold text-champagne hover:underline">
              Undo
            </button>
          )}
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="text-white/50 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CardBody({ card }: { card: Card }) {
  return (
    <>
      <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-champagne text-sm font-semibold text-coral-dark">
        {card.avatarUrl ? <Image src={card.avatarUrl} alt="" fill sizes="36px" className="object-cover" /> : card.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{card.name}</span>
        <span className="block truncate text-xs text-ink/50">{card.sub || "—"}</span>
      </span>
    </>
  );
}

/** The no-drag way to move someone (keyboard, small screens). */
function MovePicker({ card, options, onPick }: { card: Card; options: { key: string; label: string }[]; onPick: (to: string) => void }) {
  return (
    <label className="relative grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink/35 hover:bg-cream hover:text-coral-dark focus-within:bg-cream focus-within:text-coral-dark">
      <ArrowLeftRight className="h-4 w-4" />
      <select
        value=""
        onChange={(e) => e.target.value && onPick(e.target.value)}
        aria-label={`Move ${card.name} to another branch`}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Move to…</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DropDialog({
  drop,
  fromName,
  toName,
  supabase,
  onCancel,
  onMove,
  onLend,
}: {
  drop: Drop;
  fromName: string;
  toName: string;
  supabase: ReturnType<typeof createClient>;
  onCancel: () => void;
  onMove: () => void;
  onLend: () => void;
}) {
  const { card, kind, to } = drop;
  const toNone = to === NO_BRANCH;
  const canLend = kind === "staff" && !toNone && !!card.branchId;
  // Upcoming bookings at the old branch stay with them after a permanent move — warn about it.
  const [booked, setBooked] = useState<number | null>(null);
  useEffect(() => {
    if (kind !== "staff" || !card.branchId) return;
    let alive = true;
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", card.id)
      .eq("branch_id", card.branchId)
      .gte("scheduled_date", toDateKey(new Date()))
      .in("status", ["pending", "confirmed"])
      .then(({ count, error }) => {
        if (alive && !error) setBooked(count ?? 0);
      });
    return () => {
      alive = false;
    };
  }, [supabase, kind, card.id, card.branchId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={`Move ${card.name}`} className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink">
              {toNone ? `Take ${card.name} off ${fromName}?` : `${card.name} → ${toName}`}
            </h2>
            <p className="mt-0.5 text-sm text-ink/50">
              {card.sub} · now at {fromName}
            </p>
          </div>
          <button onClick={onCancel} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <button
            onClick={onMove}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-ink/10 p-4 text-left transition hover:border-coral hover:bg-blush"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose text-coral-dark">
              {toNone ? <Home className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
            </span>
            <span>
              <span className="block font-semibold text-ink">{toNone ? "Remove from branch" : kind === "staff" ? "Move for good" : "Move account"}</span>
              <span className="block text-sm text-ink/55">
                {toNone
                  ? kind === "staff"
                    ? "They won't be bookable at any branch until you place them again."
                    : "They won't see any branch's front desk until you place them again."
                  : kind === "staff"
                    ? `${toName} becomes their home branch; clients can book them there from now on.`
                    : `They'll run ${toName}'s front desk the next time their page loads.`}
              </span>
              {booked !== null && booked > 0 && (
                <span className="mt-1.5 block rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  {booked} upcoming booking{booked === 1 ? "" : "s"} at {fromName} {booked === 1 ? "is" : "are"} still with them — check them in Multi-Branch afterwards.
                </span>
              )}
            </span>
          </button>

          {kind === "staff" && !toNone && (
            <button
              onClick={onLend}
              disabled={!canLend}
              className="flex w-full items-start gap-3 rounded-xl border-2 border-ink/10 p-4 text-left transition hover:border-coral hover:bg-blush disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink/10 disabled:hover:bg-transparent"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream text-coral-dark">
                <Plane className="h-4 w-4" />
              </span>
              <span>
                <span className="block font-semibold text-ink">Lend for some days</span>
                <span className="block text-sm text-ink/55">
                  {canLend
                    ? `Stays at ${fromName}, works at ${toName} on the dates you pick (up to 15). Both front desks are told.`
                    : "They need a home branch first — move them for good instead."}
                </span>
              </span>
            </button>
          )}
        </div>

        <button onClick={onCancel} className="mt-4 w-full rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30">
          Cancel
        </button>
      </div>
    </div>
  );
}
