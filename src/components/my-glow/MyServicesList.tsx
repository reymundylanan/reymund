"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { RecentAppointment } from "@/lib/supabase/queries/myGlow";
import {
  getVisitReviews,
  saveVisitReview,
  type OtherPart,
  type ServicePart,
  type VisitReview,
} from "@/lib/supabase/queries/visitReviews";
import { reviewErrorMessage } from "@/lib/reviews";
import { getServiceImage } from "@/lib/serviceImage";
import { formatAppointmentDate } from "@/lib/appointmentFormat";

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

function PartInput({
  label,
  rating,
  text,
  onRating,
  onText,
}: {
  label: string;
  rating: number;
  text: string;
  onRating: (n: number) => void;
  onText: (t: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-ink/70">{label}</p>
      <Stars value={rating} onChange={onRating} />
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Tell us more (optional)"
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-coral"
      />
    </div>
  );
}

function VisitReviewForm({
  appointment,
  onDone,
  onDuplicate,
  onCancel,
}: {
  appointment: RecentAppointment;
  onDone: () => void | Promise<void>;
  onDuplicate: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [service, setService] = useState({ rating: 0, text: "" });
  const [staff, setStaff] = useState({ rating: 0, text: "" });
  const [branch, setBranch] = useState({ rating: 0, text: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (service.rating === 0) {
      setError("Tap a star to rate the service.");
      return;
    }
    if (appointment.professionalName && staff.text.trim() && staff.rating === 0) {
      setError("Tap a star to rate your therapist.");
      return;
    }
    if (appointment.branchId && branch.text.trim() && branch.rating === 0) {
      setError("Tap a star to rate the branch.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error: saveError, code } = await saveVisitReview(
      supabase,
      auth.user?.id ?? "",
      {
        appointmentId: appointment.id,
        services: appointment.bookedServices.map((s) => ({
          position: s.position,
          rating: service.rating,
          text: service.text,
          keep: [],
          add: [],
        })),
        staff: appointment.professionalName && staff.rating > 0 ? staff : null,
        branch: appointment.branchId && branch.rating > 0 ? branch : null,
      },
      "submit"
    );
    setSaving(false);
    if (saveError || code) {
      setError(saveError ?? reviewErrorMessage({ message: code ?? "" }));
      if (code === "REVIEW_DUPLICATE") onDuplicate();
      return;
    }
    onDone();
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-ink/10 bg-blush/30 p-3">
      <PartInput
        label={`Service — ${appointment.serviceName ?? "your service"}`}
        rating={service.rating}
        text={service.text}
        onRating={(rating) => setService((s) => ({ ...s, rating }))}
        onText={(text) => setService((s) => ({ ...s, text }))}
      />
      {appointment.professionalName && (
        <PartInput
          label={`Your therapist — ${appointment.professionalName}`}
          rating={staff.rating}
          text={staff.text}
          onRating={(rating) => setStaff((s) => ({ ...s, rating }))}
          onText={(text) => setStaff((s) => ({ ...s, text }))}
        />
      )}
      {appointment.branchId && (
        <PartInput
          label={`Branch — ${appointment.branchName ?? "Blush Spa"} (optional)`}
          rating={branch.rating}
          text={branch.text}
          onRating={(rating) => setBranch((s) => ({ ...s, rating }))}
          onText={(text) => setBranch((s) => ({ ...s, text }))}
        />
      )}
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

function ReviewPartView({ label, part }: { label: string; part: ServicePart | OtherPart | undefined }) {
  if (!part) return null;
  return (
    <div className="mt-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{label}</p>
      {part.status === "visible" ? (
        <>
          <Stars value={part.rating} size="h-3.5 w-3.5" />
          {part.text && <p className="mt-0.5 text-xs italic text-ink/50">&ldquo;{part.text}&rdquo;</p>}
        </>
      ) : (
        <p className="text-xs text-ink/40">Hidden by the spa</p>
      )}
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
  initialReviews: Record<string, VisitReview>;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const router = useRouter();

  async function refresh() {
    setReviews(await getVisitReviews(createClient(), clientId));
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`my-reviews-${clientId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews", filter: `client_id=eq.${clientId}` },
        () => {
          getVisitReviews(supabase, clientId).then(setReviews);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

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
                  <p className="text-xs text-ink/50">{formatAppointmentDate(a.scheduledDate)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}>
                  {status.label}
                </span>
              </div>

              {completed && review && (
                <div className="mt-1.5 pl-[60px]">
                  <ReviewPartView label="Service" part={review.services[0]} />
                  <ReviewPartView label="Therapist" part={review.staff} />
                  <ReviewPartView label="Branch" part={review.branch} />
                </div>
              )}

              {completed && !review && reviewingId !== a.id && (
                <div className="mt-1.5 pl-[60px]">
                  <button
                    onClick={() => setReviewingId(a.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-coral-dark hover:underline"
                  >
                    <Star className="h-3.5 w-3.5" /> Rate your visit
                  </button>
                </div>
              )}

              {completed && !review && notices[a.id] && reviewingId !== a.id && (
                <p className="mt-1.5 pl-[60px] text-xs text-ink/50">{notices[a.id]}</p>
              )}

              {completed && !review && reviewingId === a.id && (
                <VisitReviewForm
                  appointment={a}
                  onCancel={() => setReviewingId(null)}
                  onDuplicate={async () => {
                    setNotices((n) => ({ ...n, [a.id]: "You've already reviewed this visit." }));
                    await refresh();
                    setReviewingId(null);
                  }}
                  onDone={async () => {
                    await refresh();
                    setReviewingId(null);
                    router.refresh();
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
