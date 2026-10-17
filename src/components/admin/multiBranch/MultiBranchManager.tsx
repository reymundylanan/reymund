"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CalendarCheck,
  ChevronDown,
  LayoutDashboard,
  Plus,
  Footprints,
  CalendarClock,
  GripVertical,
  History,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  UserCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  checkStaffTransfer,
  formatDay,
  isBranchActive,
  missingServices,
  openSlotCount,
  presence,
  staffStatus,
  suggestAlternatives,
  toMinutes,
  type Appointment,
  type Conflict,
  type Context,
  type Staff,
} from "@/lib/multiBranch/engine";
import { manilaNow } from "@/lib/multiBranch/load";
import BranchBoard from "@/components/admin/branchBoard/BranchBoard";
import { AppointmentCard, BranchColumn, Empty, MOVABLE, Section, type ColumnStats } from "./BoardColumn";
import { AppointmentPreview, StaffPreview } from "./TransferPreview";
import ServicesPanel from "./ServicesPanel";
import HistoryPanel from "./HistoryPanel";
import ClientsBoard from "./ClientsBoard";
import StatCard from "@/components/StatCard";
import PromosPanel from "./PromosPanel";
import Link from "next/link";
import StaffBoard from "./StaffBoard";
import WalkinBoard from "./WalkinBoard";
import DayTimeline from "./DayTimeline";
import OverviewPanel, { type Tab } from "./OverviewPanel";
import { AppointmentDetails, StaffDetails } from "./StaffDetails";
import { Spinner, TONE, postJson, type Tone } from "./ui";
import { useCardDrag, type DragItem } from "./useCardDrag";
import { WalkinTransferCard } from "./BoardColumn";
import type { WalkinTransferItem } from "@/lib/multiBranch/walkinServer";

type Board = { context: Context; conflicts: Conflict[]; pendingTransferRequests: number; migrated: boolean; walkinTransfers?: WalkinTransferItem[] };
type Preview = { kind: "appointment"; id: string; branchId: string | null } | { kind: "staff"; id: string; toBranchId: string | null };
type Filters = { branch: string; staff: string; service: string; appt: string; availability: string; transfer: string; q: string };

const NEEDS = "needs";
const EMPTY_FILTERS: Filters = { branch: "all", staff: "all", service: "all", appt: "all", availability: "all", transfer: "all", q: "" };
// Transfer-status filter → walk-in transfer states.
const TRANSFER_STATES: Record<string, string[]> = {
  pending: ["waiting", "awaiting"],
  confirmed: ["confirmed", "expected"],
  active: ["checked_in", "in_service"],
  completed: ["completed"],
  cancelled: ["cancelled", "no_show"],
};
const AVAILABLE = new Set(["available", "scheduled", "partial_off"]);
const BUSY = new Set(["in_service", "on_break"]);

export default function MultiBranchManager() {
  const [date, setDate] = useState(() => manilaNow().today);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [view, setView] = useState<Tab>("overview");
  // Sub-views kept from the old page: Promos under Services, Front desk accounts under Staff.
  const [servicesSub, setServicesSub] = useState<"services" | "promos">("services");
  const [staffSub, setStaffSub] = useState<"board" | "accounts">("board");
  const [addOpen, setAddOpen] = useState(false);
  const [lower, setLower] = useState<"needs" | "history" | "activity">("needs");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [toast, setToast] = useState<{ text: string; logId?: string | null; tone?: Tone } | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  // Card whose details panel is open (staff: with the branch column it was opened from).
  const [detail, setDetail] = useState<{ kind: "staff"; id: string; branchId: string } | { kind: "appointment"; id: string } | null>(null);

  // ── Loading (filters and date are kept across refreshes) ──
  const dateRef = useRef(date);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);
  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/multi-branch/board?date=${dateRef.current}`);
      const json = (await res.json()) as Board & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't load the board.");
      setBoard(json);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)load for the chosen date
    load(true);
  }, [date, load]);

  // Live updates: any change to bookings, staff, schedules or services refreshes the board.
  useEffect(() => {
    const supabase = createClient();
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        load(true);
        setHistoryKey((k) => k + 1);
      }, 700);
    };
    const channel = supabase.channel("admin-multi-branch");
    for (const table of ["appointments", "staff_members", "staff_shifts", "staff_attendance", "branch_transfer_requests", "branch_services", "branch_transfer_log", "profiles", "walkin_transfers"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.logId ? 10000 : 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const ctx = board?.context ?? null;
  const conflicts = useMemo(() => new Map((board?.conflicts ?? []).map((c) => [c.appointmentId, c.reason])), [board]);

  // ── Filters ──
  const serviceNames = useMemo(() => [...new Set((ctx?.services ?? []).map((s) => s.name))].sort(), [ctx]);
  const serviceDept = useMemo(() => {
    const s = ctx?.services.find((x) => x.name === filters.service);
    return s?.department ?? null;
  }, [ctx, filters.service]);

  const staffMatches = useCallback(
    (s: Staff, branchId: string) => {
      if (!ctx) return false;
      if (filters.staff !== "all" && s.id !== filters.staff) return false;
      if (serviceDept && s.department !== serviceDept) return false;
      const st = staffStatus(ctx, s.id, branchId, date);
      if (filters.availability === "available" && !AVAILABLE.has(st)) return false;
      if (filters.availability === "busy" && !BUSY.has(st)) return false;
      if (filters.availability === "off" && (AVAILABLE.has(st) || BUSY.has(st))) return false;
      const q = filters.q.trim().toLowerCase();
      return !q || `${s.name} ${s.department}`.toLowerCase().includes(q);
    },
    [ctx, filters, serviceDept, date]
  );

  const apptMatches = useCallback(
    (a: Appointment) => {
      if (!ctx) return false;
      if (filters.staff !== "all" && a.professionalId !== filters.staff) return false;
      if (filters.service !== "all" && !a.services.includes(filters.service) && !a.serviceLabel.includes(filters.service)) return false;
      if (filters.appt === "conflict" && !conflicts.has(a.id)) return false;
      if ((filters.appt === "pending" || filters.appt === "confirmed") && a.status !== filters.appt) return false;
      const q = filters.q.trim().toLowerCase();
      if (!q) return true;
      const staff = ctx.staff.find((s) => s.id === a.professionalId)?.name ?? "";
      return `${a.clientName} ${a.code ?? ""} ${a.id} ${a.serviceLabel} ${staff}`.toLowerCase().includes(q);
    },
    [ctx, filters, conflicts]
  );

  const branches = useMemo(() => (ctx?.branches ?? []).filter((b) => filters.branch === "all" || b.id === filters.branch), [ctx, filters.branch]);

  // Walk-in transfers (migration 077): cards on the board, filtered like the rest.
  const walkins = useMemo(() => board?.walkinTransfers ?? [], [board]);
  const walkinMatches = useCallback(
    (w: WalkinTransferItem) => {
      if (filters.transfer !== "all" && !(TRANSFER_STATES[filters.transfer] ?? []).includes(w.state.key)) return false;
      if (filters.staff !== "all" && w.professional_id !== filters.staff) return false;
      if (filters.service !== "all" && !w.services.some((s) => s.name === filters.service)) return false;
      const q = filters.q.trim().toLowerCase();
      return !q || `${w.walkin_name} ${w.walkin_phone ?? ""} ${w.bookingCode ?? ""} ${w.staffName ?? ""} ${w.services.map((s) => s.name).join(" ")}`.toLowerCase().includes(q);
    },
    [filters]
  );
  const pendingWalkins = useMemo(
    () => walkins.filter((w) => (w.status === "waiting_availability" || w.status === "awaiting_approval") && (filters.branch === "all" || w.origin_branch_id === filters.branch) && walkinMatches(w)),
    [walkins, filters.branch, walkinMatches]
  );

  const columnData = useMemo(() => {
    if (!ctx) return new Map<string, { staff: Staff[]; appointments: Appointment[]; walkins: WalkinTransferItem[]; stats: ColumnStats }>();
    return new Map(
      branches.map((b) => {
        const here = ctx.staff.filter((s) => presence(ctx, s.id, b.id, date));
        const dayAppts = ctx.appointments.filter((a) => a.branchId === b.id && a.date === date);
        const statuses = here.map((s) => staffStatus(ctx, s.id, b.id, date));
        const stats: ColumnStats = {
          availableStaff: statuses.filter((s) => AVAILABLE.has(s)).length,
          working:
            date === ctx.today
              ? statuses.filter((s) => s === "available" || s === "in_service" || s === "on_break").length
              : new Set(dayAppts.map((a) => a.professionalId).filter(Boolean)).size,
          openSlots: isBranchActive(b) ? openSlotCount(ctx, b.id, date) : 0,
          appointments: dayAppts.length,
          conflicts: dayAppts.filter((a) => conflicts.has(a.id)).length,
          incoming:
            ctx.lends.filter((l) => l.branchId === b.id && l.dates.includes(date)).length +
            walkins.filter((w) => w.dest_branch_id === b.id && w.proposed_date === date && w.status === "confirmed").length,
          outgoing:
            ctx.lends.filter((l) => l.dates.includes(date) && ctx.staff.find((s) => s.id === l.staffId)?.branchId === b.id).length +
            walkins.filter((w) => w.origin_branch_id === b.id && w.dest_branch_id !== b.id && w.proposed_date === date && w.status === "confirmed").length,
        };
        return [
          b.id,
          {
            staff: here.filter((s) => staffMatches(s, b.id)),
            appointments: dayAppts.filter(apptMatches).sort((x, y) => toMinutes(x.start) - toMinutes(y.start)),
            walkins: walkins.filter((w) => w.status === "confirmed" && w.dest_branch_id === b.id && w.proposed_date === date && walkinMatches(w)),
            stats,
          },
        ];
      })
    );
  }, [ctx, branches, date, conflicts, staffMatches, apptMatches, walkins, walkinMatches]);

  const needs = useMemo(
    () =>
      (ctx?.appointments ?? [])
        .filter((a) => conflicts.has(a.id) && (filters.branch === "all" || a.branchId === filters.branch) && apptMatches(a))
        .sort((x, y) => x.date.localeCompare(y.date) || toMinutes(x.start) - toMinutes(y.start)),
    [ctx, conflicts, filters.branch, apptMatches]
  );

  const summary = useMemo(() => {
    if (!ctx) return null;
    let available = 0;
    let busy = 0;
    for (const s of ctx.staff) {
      const where = ctx.lends.find((l) => l.staffId === s.id && l.dates.includes(date))?.branchId ?? s.branchId;
      if (!where) continue;
      const st = staffStatus(ctx, s.id, where, date);
      if (AVAILABLE.has(st)) available++;
      if (date === ctx.today ? st === "in_service" : ctx.appointments.some((a) => a.professionalId === s.id && a.date === date)) busy++;
    }
    return {
      branches: ctx.branches.length,
      activeBranches: ctx.branches.filter(isBranchActive).length,
      available,
      busy,
      slots: [...columnData.values()].reduce((n, c) => n + c.stats.openSlots, 0),
      needs: board?.conflicts.length ?? 0,
      pending: board?.pendingTransferRequests ?? 0,
      pendingWalkins: walkins.filter((w) => w.status === "waiting_availability" || w.status === "awaiting_approval").length,
    };
  }, [ctx, date, columnData, board, walkins]);

  // Header numbers: today's bookings and walk-ins still in progress, and what's waiting.
  const glance = useMemo(() => {
    const inBranch = (id: string) => filters.branch === "all" || id === filters.branch;
    const list = (ctx?.appointments ?? []).filter((a) => a.date === date && inBranch(a.branchId) && a.sessionStatus !== "no_show");
    return {
      appointments: list.filter((a) => a.visitType !== "walk_in").length,
      walkins: list.filter((a) => a.visitType === "walk_in" && !["completed", "paid", "no_show"].includes(a.sessionStatus ?? "")).length,
    };
  }, [ctx, date, filters.branch]);
  const attention =
    (board?.conflicts.length ?? 0) +
    (board?.pendingTransferRequests ?? 0) +
    (summary?.pendingWalkins ?? 0) +
    (ctx?.appointments ?? []).filter((a) => a.status === "pending" && a.date >= (ctx?.today ?? "")).length;

  // ── Drag & drop ──
  const onDrop = useCallback(
    (item: DragItem, key: string) => {
      if (!ctx || key === NEEDS) return;
      if (item.kind === "client") return;
      if (item.kind === "staff") {
        const s = ctx.staff.find((x) => x.id === item.id);
        if (!s) return;
        if (s.branchId === key) return setToast({ text: `${s.name} already belongs to that branch.`, tone: "amber" });
        setPreview({ kind: "staff", id: s.id, toBranchId: key });
      } else {
        setPreview({ kind: "appointment", id: item.id, branchId: key });
      }
    },
    [ctx]
  );
  const { ghost, over, scroller, cardProps, columnRef, dragging } = useCardDrag(onDrop);

  // While dragging: is each branch a good destination? (green / amber / red)
  const dropHints = useMemo(() => {
    const hints = new Map<string, { tone: Tone; text: string }>();
    const item = dragging;
    if (!ctx || !item) return hints;
    const day = date < ctx.today ? ctx.today : date;
    for (const b of ctx.branches) {
      if (item.kind === "staff") {
        const s = ctx.staff.find((x) => x.id === item.id);
        if (!s) continue;
        if (s.branchId === b.id) hints.set(b.id, { tone: "red", text: "Already their home branch" });
        else if (!isBranchActive(b)) hints.set(b.id, { tone: "red", text: "Branch isn't open" });
        else {
          const r = checkStaffTransfer(ctx, { staffId: s.id, toBranchId: b.id, kind: "temporary", dates: [day] });
          hints.set(b.id, r.ok ? { tone: "green", text: `Available — drop to transfer for ${formatDay(day, ctx.today)}` } : { tone: "amber", text: "Requires review — see the preview" });
        }
      } else {
        const a = ctx.appointments.find((x) => x.id === item.id);
        if (!a) continue;
        const missing = b.id === a.branchId ? [] : missingServices(ctx, b.id, a.services);
        if (!isBranchActive(b)) hints.set(b.id, { tone: "red", text: "Branch isn't open" });
        else if (missing.length) hints.set(b.id, { tone: "red", text: `Doesn't offer ${missing.join(", ")}` });
        else if (suggestAlternatives(ctx, a, { branchIds: [b.id], days: 1, limit: 1 }).length)
          hints.set(b.id, { tone: "green", text: `Open slot ${formatDay(a.date < ctx.today ? ctx.today : a.date, ctx.today)} — drop to choose` });
        else hints.set(b.id, { tone: "amber", text: "No slot that day — review other dates" });
      }
    }
    return hints;
  }, [ctx, dragging, date]);

  // ── Actions ──
  function done(text: string, logId: string | null) {
    setPreview(null);
    setToast({ text, logId, tone: "green" });
    load(true);
    setHistoryKey((k) => k + 1);
  }

  async function undo(logId: string) {
    setToast({ text: "Undoing…" });
    try {
      await postJson("/api/admin/multi-branch/undo", { logId });
      setToast({ text: "Undone — the original assignment is back.", tone: "green" });
    } catch (e) {
      setToast({ text: (e as Error).message, tone: "red" });
    }
    load(true);
    setHistoryKey((k) => k + 1);
  }

  const openAppt = (a: Appointment, branchId: string | null = null) => setPreview({ kind: "appointment", id: a.id, branchId });
  const previewAppt = preview?.kind === "appointment" ? ctx?.appointments.find((a) => a.id === preview.id) : null;
  const previewStaff = preview?.kind === "staff" ? ctx?.staff.find((s) => s.id === preview.id) : null;
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const field = "rounded-full border border-ink/10 bg-white px-3 py-2 text-sm text-ink/70 focus:border-coral focus:outline-none";

  return (
    <div className="status-colors space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Multi-Branch Management</h1>
          <p className="text-sm text-ink/55">Manage your branches, staff, clients, services, appointments, and walk-ins in one simple workspace.</p>
        </div>
        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setView("overview")}
            aria-label={`${attention} item${attention === 1 ? "" : "s"} need attention`}
            title="Needs attention"
            className="relative grid h-10 w-10 place-items-center rounded-full border border-ink/10 bg-white text-ink/60 hover:border-coral hover:text-coral-dark"
          >
            <Bell className="h-4 w-4" />
            {attention > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{attention}</span>}
          </button>
          <button
            onClick={() => setAddOpen((o) => !o)}
            aria-expanded={addOpen}
            className="flex h-10 items-center gap-1.5 rounded-full bg-coral px-4 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark"
          >
            <Plus className="h-4 w-4" /> Add New <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {addOpen && (
            <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-[#efe3c6]" onMouseLeave={() => setAddOpen(false)}>
              {(
                [
                  ["/frontdesk/appointments?new=1", "Booking"],
                  ["/frontdesk/walk-ins", "Walk-in client"],
                  ["/admin/users", "Staff member"],
                  ["/admin/branches", "Service or branch"],
                ] as const
              ).map(([href, label]) => (
                <Link key={href} href={href} className="block px-4 py-2 text-sm text-ink/80 hover:bg-[#fbf6ea]">
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {board && !board.migrated && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Apply database migration <b>075_multi_branch_management.sql</b> in Supabase to enable transfers and the history.
        </p>
      )}
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {/* Branch · search · date */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
        <select value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })} aria-label="Branch" className={field}>
          <option value="all">All branches</option>
          {(ctx?.branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50 focus-within:border-coral">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Search staff, clients, services, bookings or walk-ins"
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink/40"
          />
          {filters.q && (
            <button onClick={() => setFilters({ ...filters, q: "" })} aria-label="Clear search" className="text-ink/40 hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        <input type="date" value={date} min={ctx?.today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day" className={field} />
        <button onClick={() => load(true)} aria-label="Refresh" className="grid h-10 w-10 place-items-center rounded-full border border-ink/10 bg-white text-ink/60 hover:border-coral hover:text-coral-dark">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
        {filtered && (
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-coral-dark hover:bg-blush">
            <RotateCcw className="h-3.5 w-3.5" /> Clear all filters
          </button>
        )}
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CalendarCheck} label="Appointments" value={glance.appointments} note={date === ctx?.today ? "Booked for today" : "Booked that day"} tint="white" onClick={() => setView("appointments")} active={view === "appointments"} />
        <StatCard icon={Footprints} label="Active walk-ins" value={glance.walkins} note="Waiting or in service" tint="peach" onClick={() => setView("walkins")} active={view === "walkins"} />
        <StatCard icon={UserCheck} label="Available staff" value={summary?.available ?? "—"} note="Free to take clients" tint="sage" tone="good" onClick={() => setView("staff")} active={view === "staff"} />
        <StatCard
          icon={ArrowLeftRight}
          label="Transfers waiting"
          value={(summary?.pending ?? 0) + (summary?.pendingWalkins ?? 0) + (summary?.needs ?? 0)}
          note={summary?.needs ? `${summary.needs} need rescheduling` : "Nothing to resolve"}
          tint="rose"
          tone={summary?.needs ? "alert" : "default"}
          onClick={() => setView("transfers")}
          active={view === "transfers"}
        />
      </div>

      {/* Boards */}
      <div role="tablist" aria-label="Boards" className="scrollbar-hidden flex max-w-full gap-1 overflow-x-auto rounded-full border border-[#e6d6ad] bg-[#fbf6ea] p-1">
        {(
          [
            ["overview", "Overview", LayoutDashboard],
            ["staff", "Staff", Users],
            ["clients", "Client Users", UserRound],
            ["services", "Services", Scissors],
            ["appointments", "Appointments", CalendarCheck],
            ["walkins", "Walk-ins", Footprints],
            ["transfers", "Transfers", ArrowLeftRight],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${view === k ? "bg-coral text-white shadow-sm" : "text-ink/80 hover:bg-white hover:text-ink"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {view === "transfers" && ctx && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={filters.staff} onChange={(e) => setFilters({ ...filters, staff: e.target.value })} aria-label="Staff" className={field}>
            <option value="all">All staff</option>
            {ctx.staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })} aria-label="Service" className={`${field} max-w-[12rem]`}>
            <option value="all">All services</option>
            {serviceNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <select value={filters.appt} onChange={(e) => setFilters({ ...filters, appt: e.target.value })} aria-label="Appointment status" className={field}>
            <option value="all">All appointments</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="conflict">Needs rescheduling</option>
          </select>
          <select value={filters.availability} onChange={(e) => setFilters({ ...filters, availability: e.target.value })} aria-label="Availability" className={field}>
            <option value="all">Any availability</option>
            <option value="available">Available</option>
            <option value="busy">In service / on break</option>
            <option value="off">Off / out / lent out</option>
          </select>
          <select value={filters.transfer} onChange={(e) => setFilters({ ...filters, transfer: e.target.value })} aria-label="Transfer status" className={field}>
            <option value="all">Any walk-in transfer</option>
            <option value="pending">Awaiting client / availability</option>
            <option value="confirmed">Confirmed / expected</option>
            <option value="active">Checked in / in service</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled / no-show</option>
          </select>
        </div>
      )}

      {loading || !ctx ? (
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-96 w-72 shrink-0 animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      ) : view === "overview" ? (
        <OverviewPanel
          ctx={ctx}
          date={date}
          branchId={filters.branch}
          needs={board?.conflicts.length ?? 0}
          pendingStaffTransfers={board?.pendingTransferRequests ?? 0}
          pendingWalkinTransfers={summary?.pendingWalkins ?? 0}
          onGo={setView}
        />
      ) : view === "staff" ? (
        <div className="space-y-3">
          <SubSwitch value={staffSub} onChange={setStaffSub} options={[["board", "Staff board"], ["accounts", "Front desk accounts"]]} />
          {staffSub === "accounts" ? (
            <BranchBoard only="accounts" />
          ) : (
            <StaffBoard
              ctx={ctx}
              date={date}
              branchId={filters.branch}
              query={filters.q}
              onOpen={(s, b) => setDetail({ kind: "staff", id: s.id, branchId: b })}
              onTransfer={(s, to) => setPreview({ kind: "staff", id: s.id, toBranchId: to })}
            />
          )}
          {previewStaff && preview?.kind === "staff" && (
            <StaffPreview
              key={`${previewStaff.id}-${preview.toBranchId}`}
              ctx={ctx}
              staff={previewStaff}
              initialToBranchId={preview.toBranchId}
              date={date}
              drawer
              onClose={() => setPreview(null)}
              onDone={done}
              onReschedule={(a) => { setView("transfers"); openAppt(a); }}
            />
          )}
        </div>
      ) : view === "clients" ? (
        <ClientsBoard ctx={ctx} refreshKey={historyKey} onDone={done} branchId={filters.branch} query={filters.q} />
      ) : view === "services" ? (
        <div className="space-y-3">
          <SubSwitch value={servicesSub} onChange={setServicesSub} options={[["services", "Services"], ["promos", "Promos"]]} />
          {servicesSub === "promos" ? (
            <PromosPanel ctx={ctx} onChanged={(text) => { setToast({ text, tone: "green" }); setHistoryKey((k) => k + 1); }} />
          ) : (
            <ServicesPanel
              ctx={ctx}
              date={date}
              onChanged={(text) => { setToast({ text, tone: "green" }); load(true); setHistoryKey((k) => k + 1); }}
              onReschedule={(a) => { setView("transfers"); openAppt(a); }}
            />
          )}
        </div>
      ) : view === "appointments" ? (
        <DayTimeline ctx={ctx} refreshKey={historyKey} onDone={done} defaultMode="kanban" defaultKind="booking" branchId={filters.branch} query={filters.q} />
      ) : view === "walkins" ? (
        <WalkinBoard ctx={ctx} branchId={filters.branch} query={filters.q} refreshKey={historyKey} onDone={done} />
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/50">
            <span className="flex items-center gap-1"><GripVertical className="h-3.5 w-3.5" /> Drag a card onto a branch — or use its button.</span>
            {(["green", "blue", "purple", "amber", "red"] as const).map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${TONE[t].dot}`} />
                {{ green: "Available", blue: "Assigned / in service", purple: "Break", amber: "Pending / review", red: "Unavailable / conflict" }[t]}
              </span>
            ))}
          </p>

          <div className={`grid gap-4 ${preview ? "lg:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
            <div ref={scroller} className="scrollbar-hidden -mx-1 flex min-w-0 snap-x gap-4 overflow-x-auto px-1 pb-4">
              {branches.map((b) => {
                const col = columnData.get(b.id)!;
                const hint = dropHints.get(b.id) ?? null;
                return (
                  <BranchColumn
                    key={b.id}
                    ctx={ctx}
                    branch={b}
                    date={date}
                    stats={col.stats}
                    staff={col.staff}
                    appointments={col.appointments}
                    conflicts={conflicts}
                    collapsed={collapsed.has(b.id)}
                    onToggle={() => setCollapsed((c) => { const n = new Set(c); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
                    columnRef={columnRef(b.id)}
                    overTone={dragging ? hint?.tone ?? null : null}
                    overText={over === b.id ? hint?.text ?? null : null}
                    dragging={dragging}
                    cardProps={cardProps}
                    onMoveStaff={(s) => setPreview({ kind: "staff", id: s.id, toBranchId: null })}
                    onMoveAppointment={(a) => openAppt(a)}
                    onOpenStaff={(s) => setDetail({ kind: "staff", id: s.id, branchId: b.id })}
                    onOpenAppointment={(a) => setDetail({ kind: "appointment", id: a.id })}
                    walkins={col.walkins}
                  />
                );
              })}
              <section ref={columnRef(NEEDS)} aria-label="Needs rescheduling" className="flex w-[18.5rem] shrink-0 snap-start flex-col rounded-2xl border-2 border-dashed border-red-200 bg-red-50/40 p-3 sm:w-[19.5rem]">
                <header className="flex items-center gap-2 px-1">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-red-100 text-red-700"><AlertTriangle className="h-4 w-4" /></span>
                  <div>
                    <h2 className="font-semibold text-ink">Needs attention</h2>
                    <p className="text-xs text-ink/50">{needs.length} booking{needs.length === 1 ? "" : "s"}{pendingWalkins.length ? ` · ${pendingWalkins.length} walk-in${pendingWalkins.length === 1 ? "" : "s"}` : ""}</p>
                  </div>
                </header>
                <Section title="Appointments">
                  {needs.map((a) => (
                    <AppointmentCard
                      key={a.id}
                      ctx={ctx}
                      appt={a}
                      showDate
                      conflict={conflicts.get(a.id)}
                      dragProps={cardProps({ kind: "appointment", id: a.id }, MOVABLE(a))}
                      dimmed={dragging?.id === a.id}
                      onReschedule={() => openAppt(a)}
                      onOpen={() => setDetail({ kind: "appointment", id: a.id })}
                    />
                  ))}
                  {needs.length === 0 && <Empty>Nothing to resolve 🎉</Empty>}
                </Section>
                {pendingWalkins.length > 0 && (
                  <Section title={`Walk-ins waiting · ${pendingWalkins.length}`}>
                    {pendingWalkins.map((w) => (
                      <WalkinTransferCard key={w.id} ctx={ctx} item={w} />
                    ))}
                  </Section>
                )}
              </section>
            </div>

            {previewAppt && preview?.kind === "appointment" && (
              <AppointmentPreview
                key={`${previewAppt.id}-${preview.branchId}`}
                ctx={ctx}
                appt={previewAppt}
                conflict={conflicts.get(previewAppt.id) ?? null}
                initialBranchId={preview.branchId}
                onClose={() => setPreview(null)}
                onDone={done}
              />
            )}
            {previewStaff && preview?.kind === "staff" && (
              <StaffPreview
                key={`${previewStaff.id}-${preview.toBranchId}`}
                ctx={ctx}
                staff={previewStaff}
                initialToBranchId={preview.toBranchId}
                date={date}
                onClose={() => setPreview(null)}
                onDone={done}
                onReschedule={(a) => openAppt(a)}
              />
            )}
          </div>

          {/* The card under the pointer */}
          {ghost && (
            <div
              className="pointer-events-none fixed left-0 top-0 z-[90] rounded-xl border border-coral bg-white p-2.5 shadow-2xl"
              style={{ width: ghost.w, transform: `translate(${ghost.x - ghost.ox}px, ${ghost.y - ghost.oy}px) rotate(2deg)` }}
            >
              {ghost.item.kind === "staff" ? (
                <p className="text-sm font-semibold text-ink">{ctx.staff.find((s) => s.id === ghost!.item.id)?.name}</p>
              ) : (
                <p className="text-sm font-semibold text-ink">{ctx.appointments.find((a) => a.id === ghost!.item.id)?.clientName}</p>
              )}
              <p className="text-xs text-ink/50">Drop on a branch</p>
            </div>
          )}

          {/* Secondary tabs */}
          <div id="mb-lower" className="rounded-2xl bg-white/60 p-3">
            <div role="tablist" aria-label="More" className="mb-3 flex flex-wrap gap-1">
              {(
                [
                  ["needs", `Pending rescheduling (${board?.conflicts.length ?? 0})`, ListChecks],
                  ["history", "Transfer history", History],
                  ["activity", "Recent activity", CalendarClock],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={lower === k}
                  onClick={() => setLower(k)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${lower === k ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink"}`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            {lower === "needs" ? (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {(ctx.appointments.filter((a) => conflicts.has(a.id)) ?? []).map((a) => (
                  <AppointmentCard key={a.id} ctx={ctx} appt={a} showDate conflict={conflicts.get(a.id)} onReschedule={() => openAppt(a)} onOpen={() => setDetail({ kind: "appointment", id: a.id })} />
                ))}
                {conflicts.size === 0 && <Empty>No appointments need rescheduling.</Empty>}
              </ul>
            ) : (
              <HistoryPanel
                ctx={ctx}
                refreshKey={historyKey}
                compact={lower === "activity"}
                onChanged={(text) => { setToast({ text, tone: "green" }); load(true); setHistoryKey((k) => k + 1); }}
              />
            )}
          </div>
        </>
      )}

      {ctx && detail?.kind === "staff" && ctx.staff.find((s) => s.id === detail.id) && (
        <StaffDetails
          ctx={ctx}
          staff={ctx.staff.find((s) => s.id === detail.id)!}
          branchId={detail.branchId}
          date={date}
          onClose={() => setDetail(null)}
          onMove={() => {
            setDetail(null);
            setPreview({ kind: "staff", id: detail.id, toBranchId: null });
          }}
        />
      )}
      {ctx && detail?.kind === "appointment" && ctx.appointments.find((a) => a.id === detail.id) && (
        <AppointmentDetails
          ctx={ctx}
          appt={ctx.appointments.find((a) => a.id === detail.id)!}
          conflict={conflicts.get(detail.id) ?? null}
          movable={MOVABLE(ctx.appointments.find((a) => a.id === detail.id)!)}
          onClose={() => setDetail(null)}
          onReschedule={() => {
            const a = ctx.appointments.find((x) => x.id === detail.id)!;
            setDetail(null);
            openAppt(a);
          }}
        />
      )}

      {toast && (
        <div role="status" className={`fixed bottom-6 left-1/2 z-[95] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-sm text-white shadow-xl ${toast.tone === "red" ? "bg-red-700" : "bg-ink"}`}>
          {toast.text === "Undoing…" && <Spinner />}
          <span>{toast.text}</span>
          {toast.logId && (
            <button onClick={() => undo(toast.logId!)} className="font-semibold text-champagne hover:underline">
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

function SubSwitch<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex w-fit rounded-full bg-white p-1 shadow-sm">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${value === k ? "bg-coral text-white shadow-sm" : "text-ink/60 hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
