"use client";

import { useState } from "react";
import Image from "next/image";
import {
  X,
  Check,
  CalendarClock,
  Ban,
  LogIn,
  CheckSquare,
  CreditCard,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  confirmAppointment,
  cancelAppointment,
  rescheduleAppointment,
  checkInClient,
  updateSessionStatus,
} from "@/lib/supabase/queries/appointments";
import { SESSION_LABEL, SESSION_STYLE, CANCELLED_LABEL } from "@/lib/sessionStatus";
import { serviceTimingLabel, serviceTimingStyle, computeServiceTiming, useServiceTimingClock } from "@/lib/serviceTiming";
import {
  clientInfo,
  appointmentStaffName,
  appointmentServiceName,
  payNowPayment,
  type AppointmentRow,
} from "@/components/frontdesk/appointments/utils";
import AppointmentPaymentModal from "@/components/frontdesk/appointments/AppointmentPaymentModal";
import PayNowReview from "@/components/frontdesk/appointments/PayNowReview";
import type { AvailabilityStatus } from "@/components/frontdesk/appointments/AppointmentsListView";
import type { StaffRow } from "@/components/frontdesk/appointments/AppointmentsManager";

const AVAILABILITY_STYLE: Record<AvailabilityStatus, string> = {
  available: "bg-green-100 text-green-700",
  busy: "bg-amber-100 text-amber-700",
  on_leave: "bg-red-100 text-red-600",
  day_off: "bg-ink/10 text-ink/50",
};

const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  available: "Available",
  busy: "Busy",
  on_leave: "On Leave",
  day_off: "Day Off",
};

function quotedAmount(notes: string | null): number | null {
  const match = notes?.match(/₱([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "danger"
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-ink/15 text-ink/70 hover:border-coral hover:text-coral-dark"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export default function AppointmentDetailPanel({
  appointment,
  staffAvailability,
  services,
  branchName,
  startInReschedule = false,
  onClose,
  onChanged,
}: {
  appointment: AppointmentRow;
  staffAvailability: Record<string, AvailabilityStatus>;
  staff: StaffRow[];
  services: { name: string; price: number }[];
  branchName: string | null;
  startInReschedule?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmConfirm, setConfirmConfirm] = useState(false);
  const [rescheduling, setRescheduling] = useState(startInReschedule);
  const [newDate, setNewDate] = useState(appointment.scheduled_date);
  const [newTime, setNewTime] = useState(appointment.start_time.slice(0, 5));
  const [showPayment, setShowPayment] = useState(false);

  const client = clientInfo(appointment.client);
  const staffPhoto =
    !Array.isArray(appointment.professional) && appointment.professional?.avatar_url
      ? appointment.professional.avatar_url
      : null;
  const staffRole =
    (!Array.isArray(appointment.professional) && appointment.professional?.department) || "Therapist";

  const serviceNames = appointmentServiceName(appointment)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const priceByName = new Map(services.map((s) => [s.name.toLowerCase(), s.price]));

  const status = appointment.status;
  const isPending = status === "pending";
  const sessionStatus = appointment.session_status;
  const now = useServiceTimingClock();
  const serviceTiming =
    sessionStatus === "in_service" ? computeServiceTiming(appointment.service_started_at, appointment.duration_minutes, now) : null;
  const payment = appointment.payments?.find((p) => p.status === "settled") ?? appointment.payments?.[0] ?? null;
  const isPaid = payment?.status === "settled";
  // Pay Now (059): a submitted GCash receipt must be verified before Confirm.
  const payNow = payNowPayment(appointment.payments);
  const awaitingPaymentCheck = payNow?.status === "pending";
  const availability = appointment.professional_id ? staffAvailability[appointment.professional_id] : undefined;
  const amount = quotedAmount(appointment.notes);

  const arrivalDate = appointment.arrival_time ? new Date(appointment.arrival_time) : null;
  const estimatedStart = appointment.service_started_at
    ? new Date(appointment.service_started_at)
    : new Date(`${appointment.scheduled_date}T${appointment.start_time}`);
  const estimatedEnd = new Date(estimatedStart.getTime() + appointment.duration_minutes * 60000);

  const scheduledStart = new Date(`${appointment.scheduled_date}T${appointment.start_time}`);
  const isAwaitingArrival = status !== "cancelled" && !sessionStatus && now >= scheduledStart;
  // Check-in opens at the scheduled start time (the spa does not check clients in early).
  const checkInOpen = now >= scheduledStart;
  const checkedInLate = !!arrivalDate && arrivalDate.getTime() > scheduledStart.getTime();

  const supabase = createClient();

  /** Drives which Quick Actions show, per the spa's exact workflow:
   * Pending -> Confirmed -> (Late/Awaiting Arrival ->) Check In (In
   * Service) -> Overdue -> Mark Complete -> Payment Pending -> Paid, or
   * the no-show branch: Late/Awaiting Arrival -> No-Show -> (Late
   * Arrival ->) Reschedule. */
  type DerivedStatus =
    | "cancelled"
    | "pending"
    | "confirmed"
    | "late_awaiting_arrival"
    | "no_show"
    | "late_arrival"
    | "in_service"
    | "overdue"
    | "payment_pending"
    | "completed_paid";

  /** A rescheduled booking clears session_status back to null (see
   * rescheduleAppointment) so it re-enters the normal pending/confirmed
   * flow at its new time rather than getting stuck — any legacy row
   * still holding the old "rescheduled" marker falls through the same
   * way here. */
  function computeDerivedStatus(): DerivedStatus {
    if (status === "cancelled") return "cancelled";
    if (sessionStatus === "no_show") return "no_show";
    if (sessionStatus === "late_arrival") return "late_arrival";
    if (sessionStatus === "completed" || sessionStatus === "paid") return isPaid ? "completed_paid" : "payment_pending";
    if (sessionStatus === "in_service") return serviceTiming?.kind === "overdue" ? "overdue" : "in_service";
    if (isPending) return "pending";
    if (isAwaitingArrival) return "late_awaiting_arrival";
    return "confirmed";
  }
  const derivedStatus = computeDerivedStatus();
  /** Check In is the one arrival action. A No-Show booking cannot be
   * checked in — it has to be rescheduled first. */
  const checkInEligible =
    derivedStatus === "confirmed" ||
    derivedStatus === "late_awaiting_arrival" ||
    derivedStatus === "late_arrival";
  const checkInOpensAt = scheduledStart.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

  async function run(action: () => Promise<{ error: string | null }>) {
    setSaving(true);
    setError(null);
    const { error: actionError } = await action();
    setSaving(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-lg font-semibold text-coral-dark">
              {client.avatar_url ? (
                <Image src={client.avatar_url} alt={client.full_name} fill className="object-cover" />
              ) : (
                client.full_name.charAt(0)
              )}
            </span>
            <div>
              <p className="font-semibold text-ink">{client.full_name}</p>
              <p className="text-sm text-ink/50">{client.phone ?? "No phone on file"}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-ink/10 p-3 text-center">
          <div>
            <p className="text-xs text-ink/40">Branch</p>
            <p className="mt-0.5 text-sm font-medium text-ink">{branchName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink/40">Price</p>
            <p className="mt-0.5 text-sm font-medium text-ink">{amount != null ? `₱${amount.toLocaleString()}.00` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink/40">Payment Status</p>
            <span
              className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                isPaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {isPaid ? "Paid" : awaitingPaymentCheck ? "Payment Submitted" : "Unpaid"}
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-ink/10 p-3">
          <div>
            <p className="font-medium text-ink">{appointmentServiceName(appointment)}</p>
            <p className="text-xs text-ink/50">{appointment.duration_minutes} minutes</p>
          </div>
          {serviceNames.length > 1 && (
            <div className="mt-2 space-y-1 border-t border-ink/10 pt-2">
              {serviceNames.map((name) => {
                const price = priceByName.get(name.toLowerCase());
                return (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-ink/60">{name}</span>
                    <span className="font-medium text-ink">
                      {price != null ? `₱${price.toLocaleString()}.00` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-ink/10 p-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-bold text-coral-dark">
              {staffPhoto ? (
                <Image src={staffPhoto} alt={appointmentStaffName(appointment)} fill className="object-cover" />
              ) : (
                appointmentStaffName(appointment).charAt(0)
              )}
            </span>
            <div>
              <p className="font-medium text-ink">{appointmentStaffName(appointment)}</p>
              <p className="text-xs text-ink/50">{staffRole}</p>
            </div>
          </div>
          {availability && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${AVAILABILITY_STYLE[availability]}`}>
              {AVAILABILITY_LABEL[availability]}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-blush/40 p-3">
          <p className="text-[11px] text-ink/40">Current Status</p>
          {serviceTiming ? (
            <span className="flex items-center gap-1.5">
              {checkedInLate && (
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">Late arrival</span>
              )}
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${serviceTimingStyle(serviceTiming)}`}>
                {serviceTimingLabel(serviceTiming)}
              </span>
            </span>
          ) : status === "cancelled" ? (
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">
              {CANCELLED_LABEL}
            </span>
          ) : sessionStatus ? (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SESSION_STYLE[sessionStatus]}`}>
              {SESSION_LABEL[sessionStatus]}
            </span>
          ) : isPending ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
              Pending Confirmation
            </span>
          ) : isAwaitingArrival ? (
            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
              Late / Awaiting Arrival
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
              Confirmed — Not Arrived
            </span>
          )}
        </div>

        {arrivalDate && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-ink/10 p-3 text-center">
            <div>
              <p className="text-[11px] text-ink/40">Arrival Time</p>
              <p className="mt-0.5 text-xs font-medium text-ink">
                {arrivalDate.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink/40">Est. Completion</p>
              <p className="mt-0.5 text-xs font-medium text-ink">
                {sessionStatus === "in_service"
                  ? `${estimatedStart.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })} – ${estimatedEnd.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`
                  : "—"}
              </p>
            </div>
          </div>
        )}

        {payNow && <PayNowReview payment={payNow} clientName={client.full_name} onChanged={onChanged} />}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {status === "cancelled" ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600">
            Booking cancelled.
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm font-semibold text-ink">Quick Actions</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ActionButton
                icon={Check}
                label="Confirm"
                disabled={saving || derivedStatus !== "pending" || awaitingPaymentCheck}
                onClick={() => setConfirmConfirm((v) => !v)}
              />

              <ActionButton
                icon={Ban}
                label="Cancel"
                tone="danger"
                disabled={
                  saving ||
                  !(
                    derivedStatus === "pending" ||
                    derivedStatus === "confirmed" ||
                    derivedStatus === "late_awaiting_arrival" ||
                    derivedStatus === "no_show" ||
                    derivedStatus === "late_arrival"
                  )
                }
                onClick={() => setConfirmCancel((v) => !v)}
              />

              <ActionButton
                icon={CalendarClock}
                label="Reschedule"
                disabled={
                  saving ||
                  !(
                    derivedStatus === "confirmed" ||
                    derivedStatus === "late_awaiting_arrival" ||
                    derivedStatus === "no_show" ||
                    derivedStatus === "late_arrival"
                  )
                }
                onClick={() => setRescheduling((v) => !v)}
              />

              <ActionButton
                icon={LogIn}
                label="Check In"
                disabled={saving || !checkInEligible || !checkInOpen}
                onClick={() => run(() => checkInClient(supabase, appointment.id))}
              />

              <ActionButton
                icon={CheckSquare}
                label="Mark Complete"
                disabled={saving || !(derivedStatus === "in_service" || derivedStatus === "overdue")}
                onClick={() => run(() => updateSessionStatus(supabase, appointment.id, "completed"))}
              />
            </div>

            {derivedStatus === "pending" && awaitingPaymentCheck && (
              <p className="mt-2 text-center text-xs font-medium text-amber-700">
                Verify the GCash payment above before confirming this booking.
              </p>
            )}

            {checkInEligible && !checkInOpen && (
              <p className="mt-2 text-center text-xs text-ink/50">Check-in opens at {checkInOpensAt}.</p>
            )}

            {derivedStatus === "payment_pending" && (
              <button
                onClick={() => setShowPayment(true)}
                disabled={saving}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CreditCard className="h-4 w-4" />
                Proceed to Payment
              </button>
            )}

            {rescheduling && (
              <div className="mt-3 rounded-xl border border-ink/10 p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="flex-1 rounded-lg border border-ink/15 px-2 py-1.5 text-sm outline-none focus:border-coral"
                  />
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="flex-1 rounded-lg border border-ink/15 px-2 py-1.5 text-sm outline-none focus:border-coral"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRescheduling(false)}
                    className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      run(async () => {
                        const result = await rescheduleAppointment(supabase, {
                          appointmentId: appointment.id,
                          professionalId: appointment.professional_id,
                          scheduledDate: newDate,
                          startTime: `${newTime}:00`,
                          durationMinutes: appointment.duration_minutes,
                        });
                        if (!result.error) setRescheduling(false);
                        return result;
                      })
                    }
                    disabled={saving}
                    className="flex-1 rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save New Time"}
                  </button>
                </div>
              </div>
            )}

            {confirmConfirm && (
              <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                <p className="text-center text-sm font-medium text-green-700">Confirm Appointment?</p>
                <dl className="grid grid-cols-2 gap-y-0.5 text-xs">
                  <dt className="text-green-900/60">Client</dt>
                  <dd className="text-right font-medium text-green-900">{client.full_name}</dd>
                  <dt className="text-green-900/60">Service</dt>
                  <dd className="text-right font-medium text-green-900">{appointmentServiceName(appointment)}</dd>
                  <dt className="text-green-900/60">Date</dt>
                  <dd className="text-right font-medium text-green-900">
                    {scheduledStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </dd>
                  <dt className="text-green-900/60">Time</dt>
                  <dd className="text-right font-medium text-green-900">
                    {scheduledStart.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
                  </dd>
                  <dt className="text-green-900/60">Payment</dt>
                  <dd className="text-right font-medium text-green-900">
                    {payNow?.status === "settled" ? "🟢 Verified (GCash)" : isPaid ? "Paid" : "Pay at the branch"}
                  </dd>
                </dl>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmConfirm(false)}
                    className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30"
                  >
                    Go back
                  </button>
                  <button
                    onClick={() =>
                      run(async () => {
                        const result = await confirmAppointment(supabase, appointment.id);
                        if (!result.error) setConfirmConfirm(false);
                        return result;
                      })
                    }
                    disabled={saving}
                    className="flex-1 rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                  >
                    {saving ? "Confirming..." : "Yes, Confirm"}
                  </button>
                </div>
              </div>
            )}

            {confirmCancel && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-center text-sm font-medium text-red-700">Cancel this booking?</p>
                <p className="text-center text-xs text-red-600">Payments are non-refundable — reschedule instead if the client can still come in.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => run(() => cancelAppointment(supabase, appointment.id))}
                    disabled={saving}
                    className="flex-1 rounded-full bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {saving ? "Cancelling..." : "Yes, Cancel"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {showPayment && (
        <AppointmentPaymentModal
          appointment={appointment}
          branchName={branchName}
          onClose={() => setShowPayment(false)}
          onPaid={() => {
            setShowPayment(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
