"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Search } from "lucide-react";
import { formatTime, type Context } from "@/lib/multiBranch/engine";
import { Badge, Spinner, postJson, type Tone } from "./ui";

type Delivery = { channel: string; status: string; error: string | null; at: string | null };
export type HistoryEntry = {
  id: string;
  transfer_type: "appointment_move" | "staff_temporary" | "staff_permanent" | "service_availability";
  status: "completed" | "undone";
  appointment_id: string | null;
  staff_member_id: string | null;
  from_branch_id: string | null;
  to_branch_id: string | null;
  from_staff_id: string | null;
  to_staff_id: string | null;
  from_date: string | null;
  from_time: string | null;
  to_date: string | null;
  to_time: string | null;
  dates: string[] | null;
  reason: string | null;
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
  validation: Record<string, unknown>;
  undo_of: string | null;
  undone_at: string | null;
  created_at: string;
  initiatedByName: string;
  clientName: string | null;
  bookingCode: string | null;
  delivery: Delivery[];
};

const TYPE_LABEL: Record<HistoryEntry["transfer_type"], string> = {
  appointment_move: "Appointment moved",
  staff_temporary: "Staff lent",
  staff_permanent: "Staff moved (permanent)",
  service_availability: "Service availability",
};

const DELIVERY_TONE: Record<string, Tone> = { sent: "green", pending: "amber", sending: "amber", failed: "red", skipped: "gray" };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const schedule = (date: unknown, time: unknown) => (date ? `${date}${time ? ` ${formatTime(String(time).slice(0, 5))}` : ""}` : "—");

export default function HistoryPanel({
  ctx,
  refreshKey,
  compact,
  onChanged,
}: {
  ctx: Context;
  refreshKey: number;
  /** Recent activity: the latest few, no filters. */
  compact?: boolean;
  onChanged: (message: string) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [day, setDay] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/multi-branch/history")
      .then(async (r) => {
        const json = (await r.json()) as { entries?: HistoryEntry[]; error?: string };
        if (!alive) return;
        if (!r.ok) setError(json.error ?? "Couldn't load the history.");
        else {
          setError(null);
          setEntries(json.entries ?? []);
        }
      })
      .catch(() => alive && setError("Couldn't load the history."));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const branchName = (id: string | null) => (id ? ctx.branches.find((b) => b.id === id)?.name ?? "—" : "—");
  const staffName = (id: string | null) => (id ? ctx.staff.find((s) => s.id === id)?.name ?? "—" : null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? [])
      .filter((e) => {
        if (compact) return true;
        if (branch !== "all" && e.from_branch_id !== branch && e.to_branch_id !== branch) return false;
        if (type !== "all" && e.transfer_type !== type) return false;
        if (status !== "all" && e.status !== status) return false;
        if (day && !e.created_at.startsWith(day) && e.from_date !== day && e.to_date !== day) return false;
        if (!q) return true;
        const hay = [
          e.clientName,
          e.bookingCode,
          e.appointment_id,
          e.reason,
          staffName(e.staff_member_id),
          staffName(e.from_staff_id),
          staffName(e.to_staff_id),
          String(e.previous.staff ?? ""),
          String(e.next.staff ?? ""),
          String(e.next.service ?? ""),
          e.initiatedByName,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, compact ? 8 : 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staffName reads ctx
  }, [entries, query, branch, type, status, day, compact, ctx]);

  async function undo(e: HistoryEntry) {
    setUndoing(e.id);
    try {
      await postJson("/api/admin/multi-branch/undo", { logId: e.id });
      onChanged("Undone — the original assignment is back.");
    } catch (err) {
      setError((err as Error).message);
    }
    setUndoing(null);
  }

  const field = "rounded-full border border-ink/10 px-3 py-2 text-sm text-ink/70";

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/50 focus-within:border-coral">
            <Search className="h-4 w-4 shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Staff, client, booking #, reason" className="w-full bg-transparent text-ink outline-none placeholder:text-ink/40" />
          </label>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch" className={field}>
            <option value="all">All branches</option>
            {ctx.branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" className={field}>
            <option value="all">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={field}>
            <option value="all">Any status</option>
            <option value="completed">Completed</option>
            <option value="undone">Undone</option>
          </select>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" className={field} />
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!entries && !error && <p className="flex items-center gap-2 text-sm text-ink/50"><Spinner /> Loading history…</p>}
      {entries && shown.length === 0 && <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-ink/45 shadow-sm">No transfers yet.</p>}

      <ul className="space-y-2">
        {shown.map((e) => {
          const isOpen = open === e.id;
          const who =
            e.transfer_type === "appointment_move"
              ? `${e.clientName ?? "Walk-in"}${e.bookingCode ? ` · #${e.bookingCode}` : ""}`
              : e.transfer_type === "service_availability"
                ? String(e.next.service ?? "Service")
                : String(e.next.staff ?? staffName(e.staff_member_id) ?? "Staff");
          return (
            <li key={e.id} className="rounded-xl bg-white shadow-sm">
              <button onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} className="flex w-full items-start gap-2 px-4 py-3 text-left">
                {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 text-ink/40" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-ink/40" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-ink">{who}</span>
                    <Badge tone="blue">{TYPE_LABEL[e.transfer_type]}</Badge>
                    {e.status === "undone" && <Badge tone="gray">Undone</Badge>}
                    {e.undo_of && <Badge tone="purple">Undo</Badge>}
                  </span>
                  <span className="block text-xs text-ink/55">
                    {e.transfer_type === "service_availability"
                      ? `${String(e.previous.branch ?? "")}: ${String(e.previous.status ?? "")} → ${String(e.next.status ?? "")}`
                      : `${branchName(e.from_branch_id)} → ${branchName(e.to_branch_id)}`}
                    {e.transfer_type === "appointment_move" && ` · ${schedule(e.from_date, e.from_time)} → ${schedule(e.to_date, e.to_time)}`}
                    {e.transfer_type === "staff_temporary" && e.dates && ` · ${e.dates.length} day${e.dates.length === 1 ? "" : "s"}`}
                  </span>
                  <span className="block text-xs text-ink/40">
                    {when(e.created_at)} · by {e.initiatedByName}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-ink/5 px-4 py-3 text-sm">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Detail title="Previous" data={e.previous} />
                    <Detail title="New" data={e.next} />
                  </div>
                  {e.reason && <p className="mt-2 text-ink/70"><b>Reason:</b> {e.reason}</p>}
                  {Object.keys(e.validation).length > 0 && (
                    <p className="mt-2 text-xs text-ink/55">
                      <b>Validation:</b>{" "}
                      {Object.entries(e.validation)
                        .filter(([k]) => k !== "checkedAt")
                        .map(([k, v]) => `${k}: ${v === true ? "yes" : v === false ? "no" : String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                  {e.transfer_type === "appointment_move" && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <b className="text-ink/70">Client notification:</b>
                      {e.delivery.length === 0 && <span className="text-ink/50">None (walk-in without an account)</span>}
                      {e.delivery.map((d) => (
                        <Badge key={d.channel} tone={DELIVERY_TONE[d.status] ?? "gray"}>
                          {d.channel}: {d.status}
                          {d.error ? ` (${d.error})` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {e.status === "completed" && e.transfer_type !== "service_availability" && !e.undo_of && (
                    <button
                      onClick={() => undo(e)}
                      disabled={undoing === e.id}
                      className="mt-3 flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-coral disabled:opacity-50"
                    >
                      {undoing === e.id ? <Spinner /> : <RotateCcw className="h-3.5 w-3.5" />} Undo (only if still safe)
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Detail({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg bg-cream/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">{title}</p>
      {Object.entries(data).map(([k, v]) => (
        <p key={k} className="text-xs text-ink/70">
          <span className="capitalize text-ink/45">{k}:</span> {Array.isArray(v) ? v.join(", ") : k === "time" && v ? formatTime(String(v).slice(0, 5)) : String(v ?? "—")}
        </p>
      ))}
    </div>
  );
}
