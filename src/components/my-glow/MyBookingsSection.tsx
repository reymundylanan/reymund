"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardList, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { appointmentStatusStyles } from "@/lib/appointmentFormat";
import { isNotMigratedError } from "@/lib/supabase/logQueryError";
import { payNowState } from "@/lib/payNow";

type BranchInfo = { name: string; phone: string | null };
type PaymentInfo = { method: string; status: string; amount: number; payment_type?: string | null };

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

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

/** Bookings shown before "Show all". */
const PREVIEW_COUNT = 2;

export default function MyBookingsSection({ userId }: { userId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  // Collapsed to the header, or open showing the newest few (all on request).
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const query = (paymentColumns: string) =>
        supabase
          .from("appointments")
          .select(
            `id, booking_code, status, session_status, notes, scheduled_date, start_time, duration_minutes, appointment_type, branch:branches(name, phone), payments(${paymentColumns})`
          )
          .eq("client_id", userId)
          .gte("scheduled_date", cutoff.toISOString().slice(0, 10))
          .order("scheduled_date", { ascending: false })
          .order("start_time", { ascending: false });
      // payment_type arrives with Pay Now (059).
      let res = await query("method, status, amount, payment_type");
      if (res.error && isNotMigratedError(res.error)) res = await query("method, status, amount");
      if (cancelled) return;
      setBookings((res.data as unknown as Booking[]) ?? []);
      setLoading(false);
    };
    load();
    // Live: Front Desk verifying a payment or confirming a booking.
    const channel = supabase
      .channel(`my-bookings-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `client_id=eq.${userId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <div id="my-bookings" className="scroll-mt-24 rounded-3xl border border-rose/60 bg-white p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="my-bookings-list"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <ClipboardList className="h-5 w-5 text-coral-dark" /> My Bookings
          {!loading && bookings.length > 0 && (
            <span className="rounded-full bg-skin px-2 py-0.5 text-xs font-semibold text-coral-dark">{bookings.length}</span>
          )}
        </h3>
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-champagne px-3 py-1 text-xs font-semibold text-ink/70 hover:border-coral">
          {open ? "Hide" : "Show"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <p className="mt-1 text-sm text-ink/50">
          Need to reschedule or cancel? Call your branch and our staff will help you.
        </p>
      )}

      {open && (
        <div id="my-bookings-list" className="mt-4 space-y-3">
          {loading && <p className="py-8 text-center text-sm text-ink/40">Loading…</p>}
          {!loading && bookings.length === 0 && (
            <p className="py-8 text-center text-sm text-ink/40">No bookings yet.</p>
          )}
          {(showAll ? bookings : bookings.slice(0, PREVIEW_COUNT)).map((b) => {
            const branch = one(b.branch);
            const payment = b.payments?.find((p) => p.status === "settled") ?? b.payments?.[0] ?? null;
            const isPaid = payment?.status === "settled";
            const payNow = payNowState(b.payments);
            const isActive = b.status !== "cancelled" && b.session_status !== "completed" && b.session_status !== "paid";
            return (
              <div
                key={b.id}
                className={`rounded-xl border p-4 ${b.status === "cancelled" ? "border-red-200 bg-red-50/40" : "border-ink/10"}`}
              >
                {b.status === "cancelled" && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">⚠ Booking Cancelled — No Refund</p>
                )}
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-medium text-ink">{b.notes ?? "Appointment"}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-medium capitalize ${appointmentStatusStyles[b.session_status ?? b.status] ?? appointmentStatusStyles[b.status] ?? "bg-ink/10 text-ink/50"}`}>
                    {(b.session_status ?? b.status).replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink/60">
                  {new Date(b.scheduled_date).toLocaleDateString()} &bull; {formatTime(b.start_time)}
                  {branch && <> &bull; {branch.name}</>}
                </p>
                <p className="mt-1 text-sm">
                  {payNow === "submitted" ? (
                    <span className="font-medium text-amber-700">🟡 Pending Verification — your GCash receipt is being checked</span>
                  ) : payNow === "verified" ? (
                    <span className="font-medium text-green-700">🟢 Paid via GCash (₱{Number(payment?.amount ?? 0).toLocaleString()}.00)</span>
                  ) : payNow === "not_received" ? (
                    <span className="font-medium text-red-600">Payment not received — please call your branch</span>
                  ) : payment ? (
                    <span className="font-medium text-green-700">
                      {isPaid ? "Paid" : "Payment pending"} via {methodLabels[payment.method] ?? payment.method} (₱{payment.amount.toLocaleString()}.00)
                    </span>
                  ) : (
                    <span className="font-medium text-amber-700">Pay Later — settle at branch</span>
                  )}
                </p>
                {b.booking_code && <p className="mt-1 text-xs text-ink/40">Ref: {b.booking_code}</p>}
                <Link
                  href={`/my-glow/appointments/${b.id}`}
                  className="mt-1 inline-block text-sm font-medium text-coral-dark hover:underline"
                >
                  View details &rarr;
                </Link>

                {isActive && (
                  <p className="mt-2.5 flex items-center gap-1.5 border-t border-ink/10 pt-2.5 text-xs text-ink/50">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    To reschedule or cancel, call{" "}
                    {branch?.phone ? (
                      <a href={`tel:${branch.phone}`} className="font-medium text-coral-dark underline">
                        {branch.phone}
                      </a>
                    ) : (
                      "your branch"
                    )}
                    . Payments are non-refundable.
                  </p>
                )}
              </div>
            );
          })}
          {bookings.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-champagne py-2.5 text-sm font-semibold text-coral-dark hover:bg-cream"
            >
              {showAll ? "Show less" : `Show all ${bookings.length} bookings`}
              <ChevronDown className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
