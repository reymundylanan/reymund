"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cancelMyBookingAction, rescheduleMyBookingAction } from "@/app/my-glow/actions";

type BranchInfo = { name: string; phone: string | null };
type PaymentInfo = { method: string; status: string; amount: number };

type Booking = {
  id: string;
  booking_code: string | null;
  status: string;
  session_status: string | null;
  notes: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  appointment_type: "solo" | "group";
  branch: BranchInfo | BranchInfo[] | null;
  payments: PaymentInfo[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const methodLabels: Record<string, string> = { gcash: "GCash", cash: "Cash", credit_card: "Credit Card" };

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-ink/10 text-ink/50",
  no_show: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

/** Once the client has actually arrived (or the booking is over),
 * changing the schedule from here no longer makes sense — those cases
 * are handled at the branch, not from My Glow. */
function isChangeable(b: Booking) {
  return b.status !== "cancelled" && !b.session_status;
}

export default function MyBookingsSection({ userId }: { userId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    const supabase = createClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    supabase
      .from("appointments")
      .select(
        "id, booking_code, status, session_status, notes, scheduled_date, start_time, duration_minutes, appointment_type, branch:branches(name, phone), payments(method, status, amount)"
      )
      .eq("client_id", userId)
      .gte("scheduled_date", cutoff.toISOString().slice(0, 10))
      .order("scheduled_date", { ascending: false })
      .order("start_time", { ascending: false })
      .then(({ data }) => {
        setBookings((data as unknown as Booking[]) ?? []);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function toggleExpand(b: Booking) {
    const next = expandedId === b.id ? null : b.id;
    setExpandedId(next);
    setRescheduling(false);
    setCancelling(false);
    setError(null);
    if (next) {
      setNewDate(b.scheduled_date);
      setNewTime(b.start_time.slice(0, 5));
    }
  }

  async function handleReschedule(b: Booking) {
    setSaving(true);
    setError(null);
    const result = await rescheduleMyBookingAction({
      appointmentId: b.id,
      scheduledDate: newDate,
      startTime: `${newTime}:00`,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRescheduling(false);
    setExpandedId(null);
    load();
  }

  async function handleCancel(b: Booking) {
    setSaving(true);
    setError(null);
    const result = await cancelMyBookingAction(b.id);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCancelling(false);
    setExpandedId(null);
    load();
  }

  return (
    <div id="my-bookings" className="scroll-mt-24 rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <ClipboardList className="h-5 w-5 text-coral-dark" /> My Bookings
      </h3>
      <p className="mt-1 text-sm text-ink/50">View, reschedule, or cancel your appointments.</p>

      <div className="mt-4 space-y-3">
        {loading && <p className="py-8 text-center text-sm text-ink/40">Loading…</p>}
        {!loading && bookings.length === 0 && (
          <p className="py-8 text-center text-sm text-ink/40">No bookings yet.</p>
        )}
        {bookings.map((b) => {
          const branch = one(b.branch);
          const payment = b.payments?.[0] ?? null;
          const isPaid = payment?.status === "settled";
          const expanded = expandedId === b.id;
          return (
            <div
              key={b.id}
              className={`rounded-xl border transition ${b.status === "cancelled" ? "border-red-200 bg-red-50/40" : "border-ink/10"}`}
            >
              <button onClick={() => toggleExpand(b)} className="w-full p-4 text-left">
                {b.status === "cancelled" && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">⚠ Booking Cancelled — No Refund</p>
                )}
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-medium text-ink">{b.notes ?? "Appointment"}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-medium capitalize ${statusStyles[b.session_status ?? b.status] ?? statusStyles[b.status] ?? "bg-ink/10 text-ink/50"}`}>
                    {(b.session_status ?? b.status).replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink/60">
                  {new Date(b.scheduled_date).toLocaleDateString()} &bull; {formatTime(b.start_time)}
                  {branch && <> &bull; {branch.name}</>}
                </p>
                <p className="mt-1 text-sm">
                  {payment ? (
                    <span className="font-medium text-green-700">
                      {isPaid ? "Paid" : "Payment pending"} via {methodLabels[payment.method] ?? payment.method} (₱{payment.amount.toLocaleString()}.00)
                    </span>
                  ) : (
                    <span className="font-medium text-amber-700">Pay Later — settle at branch</span>
                  )}
                </p>
                {b.booking_code && <p className="mt-1 text-xs text-ink/40">Ref: {b.booking_code}</p>}
              </button>

              {expanded && (
                <div className="border-t border-ink/10 p-4">
                  {isChangeable(b) ? (
                    <>
                      {!rescheduling && !cancelling && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRescheduling(true)}
                            className="flex-1 rounded-full border border-coral px-4 py-2 text-sm font-semibold text-coral-dark hover:bg-blush"
                          >
                            Reschedule
                          </button>
                          <button
                            onClick={() => setCancelling(true)}
                            className="flex-1 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                          >
                            Cancel Booking
                          </button>
                        </div>
                      )}

                      {rescheduling && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="date"
                              value={newDate}
                              onChange={(e) => setNewDate(e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                            />
                            <input
                              type="time"
                              value={newTime}
                              onChange={(e) => setNewTime(e.target.value)}
                              className="flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                            />
                          </div>
                          {error && <p className="text-xs text-red-600">{error}</p>}
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setRescheduling(false);
                                setError(null);
                              }}
                              className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30"
                            >
                              Go Back
                            </button>
                            <button
                              onClick={() => handleReschedule(b)}
                              disabled={saving}
                              className="flex-1 rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save New Time"}
                            </button>
                          </div>
                        </div>
                      )}

                      {cancelling && (
                        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                          <p className="text-sm font-semibold text-red-700">Payments are non-refundable.</p>
                          {isPaid ? (
                            <p className="text-xs text-red-700/80">
                              This booking is already paid. If you need a different date or time, use{" "}
                              <span className="font-medium">Reschedule</span> instead — your payment carries over. To
                              cancel entirely, call{" "}
                              {branch?.phone ? (
                                <a href={`tel:${branch.phone}`} className="font-medium underline">
                                  {branch.phone}
                                </a>
                              ) : (
                                "your branch"
                              )}{" "}
                              or confirm below.
                            </p>
                          ) : (
                            <p className="text-xs text-red-700/80">Are you sure you want to cancel this booking?</p>
                          )}
                          {error && <p className="text-xs text-red-600">{error}</p>}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => {
                                setCancelling(false);
                                setError(null);
                              }}
                              className="flex-1 rounded-full border border-ink/15 bg-white py-2 text-sm text-ink/60 hover:border-ink/30"
                            >
                              Keep Booking
                            </button>
                            <button
                              onClick={() => handleCancel(b)}
                              disabled={saving}
                              className="flex-1 rounded-full bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                            >
                              {saving ? "Cancelling..." : "Cancel Anyway — No Refund"}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-ink/40">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {b.status === "cancelled"
                        ? "This booking was cancelled."
                        : "This booking is already underway or finished — reschedule and cancel are no longer available."}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
