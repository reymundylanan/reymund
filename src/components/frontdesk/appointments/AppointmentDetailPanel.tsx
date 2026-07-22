"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PaymentInfo = { method: string; status: string; amount: number };

type AppointmentDetail = {
  id: string;
  booking_code: string | null;
  appointment_type: "solo" | "group";
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
  clientName: string;
  clientPhone: string | null;
  payment: PaymentInfo | null;
};

const methodLabels: Record<string, string> = {
  gcash: "GCash",
  cash: "Cash",
  credit_card: "Credit Card",
};

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export default function AppointmentDetailPanel({
  appointment,
  onClose,
  onConfirmed,
}: {
  appointment: AppointmentDetail;
  onClose: () => void;
  onConfirmed?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(appointment.status);

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", appointment.id);

    if (updateError) {
      setError(updateError.message);
      setConfirming(false);
      return;
    }

    setStatus("confirmed");
    setConfirming(false);
    onConfirmed?.();
  }

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointment.id);

    if (updateError) {
      setError(updateError.message);
      setCancelling(false);
      return;
    }

    setStatus("cancelled");
    setCancelling(false);
    setConfirmCancel(false);
    onConfirmed?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Booking Details</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blush text-lg font-semibold text-coral-dark">
            {appointment.clientName.charAt(0)}
          </span>
          <div>
            <p className="font-semibold text-ink">{appointment.clientName}</p>
            <p className="text-sm text-ink/50">
              {appointment.clientPhone ?? "No phone on file"}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3 rounded-xl border border-ink/10 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/40">Booking Code</span>
            <span className="text-ink/70">{appointment.booking_code ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">Service</span>
            <span className="text-right text-ink/70">{appointment.notes ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">Date</span>
            <span className="text-ink/70">
              {new Date(appointment.scheduled_date).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">Time</span>
            <span className="text-ink/70">
              {formatTime(appointment.start_time)} ({appointment.duration_minutes} mins)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">Type</span>
            <span className="capitalize text-ink/70">{appointment.appointment_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">Status</span>
            <span className="capitalize text-ink/70">{status.replace("_", " ")}</span>
          </div>
          <div className="flex justify-between border-t border-ink/10 pt-3">
            <span className="text-ink/40">Payment</span>
            <span className="text-right text-ink/70">
              {appointment.payment ? (
                <>
                  {methodLabels[appointment.payment.method] ?? appointment.payment.method}
                  {" — "}
                  <span
                    className={
                      appointment.payment.status === "settled"
                        ? "font-medium text-green-700"
                        : "font-medium text-amber-700"
                    }
                  >
                    {appointment.payment.status === "settled" ? "Paid" : "Pending"}
                  </span>
                  {" "}(₱{appointment.payment.amount.toLocaleString()}.00)
                </>
              ) : (
                <span className="font-medium text-amber-700">
                  Pay Later — settle at branch
                </span>
              )}
            </span>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {status === "cancelled" ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600">
            Booking cancelled.
          </div>
        ) : status === "confirmed" ? (
          <div className="mt-6 space-y-2">
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center text-sm text-green-700">
              Booking confirmed.
            </div>
            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cancel Booking
              </button>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-sm text-red-700 text-center font-medium">Cancel this booking?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmCancel(false)} className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30">Keep</button>
                  <button onClick={handleCancel} disabled={cancelling} className="flex-1 rounded-full bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
                    {cancelling ? "Cancelling..." : "Yes, Cancel"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#8D6F5D" }}
            >
              <Check className="h-4 w-4" />
              {confirming ? "Confirming..." : "Confirm Booking"}
            </button>
            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cancel Booking
              </button>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-sm text-red-700 text-center font-medium">Cancel this booking?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmCancel(false)} className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30">Keep</button>
                  <button onClick={handleCancel} disabled={cancelling} className="flex-1 rounded-full bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
                    {cancelling ? "Cancelling..." : "Yes, Cancel"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
