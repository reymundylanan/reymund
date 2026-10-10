"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, ArrowRight, Inbox, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import WalkinTransferModal from "@/components/frontdesk/payments/WalkinTransferModal";
import type { HairSize } from "@/lib/multiBranch/walkin";

export type WalkinTransferView = {
  id: string;
  status: "waiting_availability" | "awaiting_approval" | "confirmed" | "cancelled";
  state: { key: string; label: string; tone: "green" | "blue" | "amber" | "red" | "gray" | "purple" };
  direction: "outgoing" | "incoming" | "all";
  client_id: string | null;
  walkin_name: string;
  walkin_phone: string | null;
  services: { name?: string; size?: HairSize | null; price?: number | null }[];
  duration_minutes: number;
  origin_price: number | null;
  price: number | null;
  originName: string;
  destName: string | null;
  destAddress: string | null;
  staffName: string | null;
  proposed_date: string | null;
  proposed_time: string | null;
  mode: "immediate" | "later" | null;
  bookingCode: string | null;
  initiatedByName: string | null;
  created_at: string;
};

const TONE: Record<WalkinTransferView["state"]["tone"], string> = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  gray: "bg-ink/5 text-ink/55",
  purple: "bg-purple-100 text-purple-700",
};

const fmtTime = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

/** Walk-ins this desk sent to other branches, and ones coming here. */
export default function WalkinTransfersPanel({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<WalkinTransferView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<WalkinTransferView | null>(null);
  const [cancelling, setCancelling] = useState<WalkinTransferView | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/walkin-transfer/list?days=7");
      const j = (await r.json()) as { transfers?: WalkinTransferView[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Couldn't load walk-in transfers.");
      setRows(j.transfers ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)load the list
    load();
  }, [load, refreshKey, tick]);

  // Live: a booking checked in or started at the other branch updates here.
  useEffect(() => {
    const supabase = createClient();
    let t = 0;
    const again = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setTick((n) => n + 1), 600);
    };
    const ch = supabase
      .channel("walkin-transfers")
      .on("postgres_changes", { event: "*", schema: "public", table: "walkin_transfers" }, again)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments" }, again)
      .subscribe();
    return () => {
      window.clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, []);

  async function cancel(row: WalkinTransferView) {
    setBusy(true);
    try {
      const r = await fetch("/api/walkin-transfer/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferId: row.id }) });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Couldn't cancel.");
      setCancelling(null);
      load();
    } catch (e) {
      setError((e as Error).message);
      setCancelling(null);
    }
    setBusy(false);
  }

  if (rows && rows.length === 0 && !error) return null;

  return (
    <div className="status-colors rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blush text-coral-dark">
          <ArrowLeftRight className="h-4 w-4" />
        </span>
        Walk-in transfers
        <span className="text-xs font-normal text-ink/45">last 7 days</span>
      </h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ul className="mt-3 divide-y divide-ink/5">
        {(rows ?? []).map((r) => {
          const incoming = r.direction === "incoming";
          const open = r.status === "waiting_availability" || r.status === "awaiting_approval";
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${incoming ? "bg-blue-50 text-blue-600" : "bg-cream text-coral-dark"}`} title={incoming ? "Coming here" : "Sent from here"}>
                {incoming ? <Inbox className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {r.walkin_name}
                  <span className="font-normal text-ink/50"> · {r.services.map((s) => s.name).join(", ")}</span>
                </p>
                <p className="flex flex-wrap items-center gap-1 text-xs text-ink/55">
                  {r.originName} <ArrowRight className="h-3 w-3" /> {r.destName ?? "no branch yet"}
                  {r.proposed_date && ` · ${r.proposed_date} ${fmtTime(r.proposed_time)}`}
                  {r.staffName && ` · ${r.staffName}`}
                  {r.bookingCode && ` · #${r.bookingCode}`}
                </p>
                {incoming && r.state.key === "expected" && (
                  <p className="text-xs font-medium text-blue-700">Check them in from Appointments when they arrive.</p>
                )}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[r.state.tone]}`}>{r.state.label}</span>
              {!incoming && open && (
                <button onClick={() => setResume(r)} className="rounded-full bg-coral px-3 py-1 text-xs font-semibold text-white">
                  {r.status === "awaiting_approval" ? "Client answered" : "Search again"}
                </button>
              )}
              {!incoming && r.status !== "cancelled" && ["waiting", "awaiting", "confirmed", "expected"].includes(r.state.key) && (
                <button onClick={() => setCancelling(r)} className="rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink/60 hover:border-red-300 hover:text-red-600">
                  Cancel
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {resume && (
        <WalkinTransferModal
          clientName={resume.walkin_name}
          clientPhone={resume.walkin_phone}
          clientId={resume.client_id}
          initialServices={resume.services.map((s) => ({ name: s.name ?? "", size: s.size ?? null, price: s.price ?? null })).filter((s) => s.name)}
          initialDuration={resume.duration_minutes}
          originPrice={resume.origin_price}
          transferId={resume.id}
          onClose={() => setResume(null)}
          onBooked={() => {
            setResume(null);
            load();
          }}
        />
      )}

      {cancelling && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <p className="font-semibold text-ink">Cancel {cancelling.walkin_name}&apos;s transfer?</p>
            <p className="mt-1 text-sm text-ink/60">
              {cancelling.status === "confirmed"
                ? `This also cancels the booking at ${cancelling.destName}. It can't be cancelled once they've checked in there.`
                : "The saved request is closed; nothing was booked."}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setCancelling(null)} className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60">
                Keep
              </button>
              <button onClick={() => cancel(cancelling)} disabled={busy} className="flex-1 rounded-full bg-red-500 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
