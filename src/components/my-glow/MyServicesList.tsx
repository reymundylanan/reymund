"use client";

import { useState } from "react";
import Image from "next/image";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  submitServiceReview,
  type RecentAppointment,
  type ServiceReview,
} from "@/lib/supabase/queries/myGlow";
import { getServiceImage } from "@/lib/serviceImage";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-amber-100 text-amber-700",
  checked_in: "bg-blue-100 text-blue-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  no_show: "bg-red-100 text-red-600",
  conflict: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

const statusLabels: Record<string, string> = {
  pending: "Upcoming",
  confirmed: "Upcoming",
  checked_in: "Upcoming",
  in_service: "In Service",
  completed: "Completed",
  no_show: "No Show",
  conflict: "Conflict",
  cancelled: "Cancelled",
};

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "checked_in", "in_service"]);

function isPastDate(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return target.getTime() < today.getTime();
}

/** Front Desk marks a finished service via session_status (completed,
 * then paid) while the booking-level status stays "confirmed" — so
 * session_status has to win, or a done service reads as "Upcoming". */
function isCompleted(a: RecentAppointment) {
  return a.status === "completed" || a.sessionStatus === "completed" || a.sessionStatus === "paid";
}

function displayStatus(a: RecentAppointment) {
  if (a.status === "cancelled") return { label: "Cancelled", style: statusStyles.cancelled };
  if (isCompleted(a)) return { label: "Completed", style: statusStyles.completed };
  if (a.sessionStatus === "no_show") return { label: "No Show", style: statusStyles.no_show };
  if (a.sessionStatus === "in_service") return { label: "In Service", style: statusStyles.in_service };
  // A booking left "confirmed"/"pending" past its date means staff never
  // updated it to completed/no-show — don't keep calling it "Upcoming".
  if (ACTIVE_STATUSES.has(a.status) && isPastDate(a.scheduledDate)) {
    return { label: "Past", style: "bg-ink/10 text-ink/50" };
  }
  return {
    label: statusLabels[a.status] ?? a.status,
    style: statusStyles[a.status] ?? "bg-ink/10 text-ink/50",
  };
}

function Stars({ value, onChange, size = "h-5 w-5" }: { value: number; onChange?: (n: number) => void; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star className={`${size} ${n <= value ? "fill-amber-400 text-amber-400" : "text-ink/20"}`} />
        </button>
      ))}
    </div>
  );
}

function ReviewForm({
  appointment,
  clientId,
  onDone,
  onCancel,
}: {
  appointment: RecentAppointment;
  clientId: string;
  onDone: (review: ServiceReview) => void;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating === 0) {
      setError("Tap a star to rate this service.");
      return;
    }
    if (!appointment.branchId) {
      setError("Couldn't find the branch for this booking.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: submitError } = await submitServiceReview(createClient(), {
      clientId,
      appointmentId: appointment.id,
      branchId: appointment.branchId,
      rating,
      text,
    });
    setSaving(false);
    if (submitError) {
      setError(submitError);
      return;
    }
    onDone({ rating, text: text.trim() || null });
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-ink/10 bg-blush/30 p-3">
      <Stars value={rating} onChange={setRating} />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="How was your experience? (optional)"
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-coral"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-full border border-ink/15 bg-white py-1.5 text-xs text-ink/60 hover:border-ink/30"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex-1 rounded-full bg-coral py-1.5 text-xs font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
        >
          {saving ? "Submitting..." : "Submit Review"}
        </button>
      </div>
    </div>
  );
}

export default function MyServicesList({
  appointments,
  clientId,
  initialReviews,
}: {
  appointments: RecentAppointment[];
  clientId: string;
  initialReviews: Record<string, ServiceReview>;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  return (
    <div id="services" className="rounded-3xl border border-rose/60 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">My Services</h3>
      </div>

      <div className="mt-4 space-y-3">
        {appointments.length === 0 && (
          <p className="py-6 text-center text-sm text-ink/40">No services booked yet.</p>
        )}
        {appointments.map((a) => {
          const status = displayStatus(a);
          const completed = isCompleted(a);
          const review = reviews[a.id];
          return (
            <div key={a.id}>
              <div className="flex items-center gap-3">
                <Image
                  src={getServiceImage(a.serviceName)}
                  alt={a.serviceName ?? "Service"}
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">{a.serviceName ?? "Appointment"}</p>
                  <p className="text-xs text-ink/50">{new Date(a.scheduledDate).toLocaleDateString()}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}>
                  {status.label}
                </span>
              </div>

              {completed && review && (
                <div className="mt-1.5 pl-[60px]">
                  <Stars value={review.rating} size="h-3.5 w-3.5" />
                  {review.text && <p className="mt-0.5 text-xs italic text-ink/50">&ldquo;{review.text}&rdquo;</p>}
                </div>
              )}

              {completed && !review && reviewingId !== a.id && (
                <div className="mt-1.5 pl-[60px]">
                  <button
                    onClick={() => setReviewingId(a.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-coral-dark hover:underline"
                  >
                    <Star className="h-3.5 w-3.5" /> Rate &amp; Review
                  </button>
                </div>
              )}

              {completed && !review && reviewingId === a.id && (
                <ReviewForm
                  appointment={a}
                  clientId={clientId}
                  onCancel={() => setReviewingId(null)}
                  onDone={(r) => {
                    setReviews((prev) => ({ ...prev, [a.id]: r }));
                    setReviewingId(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
