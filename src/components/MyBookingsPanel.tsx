"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type BranchInfo = { name: string };
type PaymentInfo = { method: string; status: string; amount: number };

type Booking = {
  id: string;
  booking_code: string | null;
  status: string;
  notes: string | null;
  scheduled_date: string;
  start_time: string;
  appointment_type: "solo" | "group";
  branch: BranchInfo | BranchInfo[] | null;
  payments: PaymentInfo[] | null;
};

function branchName(branch: Booking["branch"]) {
  if (!branch) return null;
  return Array.isArray(branch) ? branch[0]?.name ?? null : branch.name;
}

const methodLabels: Record<string, string> = {
  gcash: "GCash",
  cash: "Cash",
  credit_card: "Credit Card",
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  checked_in: "bg-blue-100 text-blue-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-ink/10 text-ink/50",
  no_show: "bg-red-100 text-red-600",
  conflict: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export default function MyBookingsPanel({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    supabase
      .from("appointments")
      .select(
        "id, booking_code, status, notes, scheduled_date, start_time, appointment_type, branch:branches(name), payments(method, status, amount)"
      )
      .eq("client_id", userId)
      .gte("scheduled_date", cutoffDate)
      .order("scheduled_date", { ascending: false })
      .order("start_time", { ascending: false })
      .then(({ data }) => {
        setBookings((data as unknown as Booking[]) ?? []);
        setLoading(false);
      });
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">My Bookings</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {loading && (
            <p className="py-8 text-center text-sm text-ink/40">Loading…</p>
          )}
          {!loading && bookings.length === 0 && (
            <p className="py-8 text-center text-sm text-ink/40">
              No bookings yet.
            </p>
          )}
          {bookings.map((b) => (
            <div key={b.id} className={`rounded-xl border p-4 ${b.status === "cancelled" ? "border-red-200 bg-red-50/40" : "border-ink/10"}`}>
              {b.status === "cancelled" && (
                <p className="mb-2 text-xs font-semibold text-red-600 uppercase tracking-wide">⚠ Booking Cancelled</p>
              )}
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-medium text-ink">
                  {b.notes ?? "Appointment"}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-medium capitalize ${
                    statusStyles[b.status] ?? "bg-ink/10 text-ink/50"
                  }`}
                >
                  {b.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink/60">
                {new Date(b.scheduled_date).toLocaleDateString()} &bull;{" "}
                {formatTime(b.start_time)} &bull;{" "}
                <span className="capitalize">{b.appointment_type}</span>
              </p>
              {branchName(b.branch) && (
                <p className="mt-1.5 text-sm font-medium text-coral-dark">
                  Branch: {branchName(b.branch)}
                </p>
              )}
              <p className="mt-1.5 text-sm">
                {b.payments && b.payments[0] ? (
                  <span className="font-medium text-green-700">
                    Paid via {methodLabels[b.payments[0].method] ?? b.payments[0].method}{" "}
                    (₱{b.payments[0].amount.toLocaleString()}.00)
                  </span>
                ) : (
                  <span className="font-medium text-amber-700">
                    Pay Later — settle at branch
                  </span>
                )}
              </p>
              {b.booking_code && (
                <p className="mt-1.5 text-sm text-ink/40">Ref: {b.booking_code}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
