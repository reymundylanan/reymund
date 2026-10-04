"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { RecentAppointment } from "@/lib/supabase/queries/myGlow";
import { getVisitReviews, type VisitReview } from "@/lib/supabase/queries/visitReviews";
import { canEditReview, isPublicStatus, type ReviewStatus } from "@/lib/reviews";
import { getServiceImage } from "@/lib/serviceImage";
import { formatAppointmentDate } from "@/lib/appointmentFormat";
import StarInput from "@/components/reviews/StarInput";
import VisitReviewModal from "@/components/reviews/VisitReviewModal";

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


function allStatuses(review: VisitReview): ReviewStatus[] {
  return [...review.services.map((s) => s.status), review.staff?.status, review.branch?.status].filter(
    (s): s is ReviewStatus => !!s
  );
}

type ModalState = { id: string; mode: "submit" | "edit" | "view" } | null;

/** Services shown before "Show all". */
const PREVIEW_COUNT = 3;

export default function MyServicesList({
  appointments,
  clientId,
  initialReviews,
  openReviewId,
}: {
  appointments: RecentAppointment[];
  clientId: string;
  initialReviews: Record<string, VisitReview>;
  openReviewId?: string;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [modal, setModal] = useState<ModalState>(null);
  const [handledId, setHandledId] = useState<string | undefined>(undefined);
  // Collapsed to the header, or open showing the newest few (all on request).
  // A deep-linked visit further down opens the full list.
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(() => appointments.findIndex((a) => a.id === openReviewId) >= PREVIEW_COUNT);
  const router = useRouter();

  // Deep link (?review=<id>), also on same-page soft navigation: open the
  // modal when the visit is in the list and completed. Adjusted during render
  // so the prop change is picked up without an effect-driven state update.
  if (openReviewId !== handledId) {
    setHandledId(openReviewId);
    const target = openReviewId ? appointments.find((a) => a.id === openReviewId) : undefined;
    if (target && isCompleted(target)) setModal({ id: target.id, mode: reviews[target.id] ? "view" : "submit" });
  }

  async function refresh() {
    setReviews(await getVisitReviews(createClient(), clientId));
  }

  useEffect(() => {
    if (openReviewId) document.getElementById("services")?.scrollIntoView();
  }, [openReviewId]);

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

  const modalAppointment = modal ? appointments.find((a) => a.id === modal.id) : undefined;

  return (
    <div id="services" className="rounded-3xl border border-rose/60 bg-white p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="my-services-list"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
          My Services
          {appointments.length > 0 && (
            <span className="rounded-full bg-skin px-2 py-0.5 text-xs font-semibold text-coral-dark">{appointments.length}</span>
          )}
        </h3>
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-champagne px-3 py-1 text-xs font-semibold text-ink/70 hover:border-coral">
          {open ? "Hide" : "Show"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      <div id="my-services-list" className={open ? "mt-4 space-y-3" : "hidden"}>
        {appointments.length === 0 && (
          <p className="py-6 text-center text-sm text-ink/40">No services booked yet.</p>
        )}
        {(showAll ? appointments : appointments.slice(0, PREVIEW_COUNT)).map((a) => {
          const status = displayStatus(a);
          const completed = isCompleted(a);
          const review = reviews[a.id];
          const partHidden = review ? allStatuses(review).some((s) => !isPublicStatus(s)) : false;
          const average =
            review && review.services.length > 0
              ? Math.round(review.services.reduce((n, s) => n + s.rating, 0) / review.services.length)
              : 0;
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
                  <p className="text-xs text-ink/50">
                    {formatAppointmentDate(a.scheduledDate)}
                    {a.visitType === "walk_in" && (
                      <span className="ml-2 rounded-full bg-blush px-2 py-0.5 text-[10px] font-semibold text-coral-dark">
                        Walk-In
                      </span>
                    )}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}>
                  {status.label}
                </span>
              </div>

              {completed && !review && (
                <div className="mt-1.5 pl-[60px]">
                  <button
                    onClick={() => setModal({ id: a.id, mode: "submit" })}
                    className="flex items-center gap-1 text-xs font-semibold text-coral-dark hover:underline"
                  >
                    <Star className="h-3.5 w-3.5" /> Rate &amp; Review
                  </button>
                </div>
              )}

              {completed && review && (
                <div className="mt-1.5 space-y-1 pl-[60px]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StarInput value={average} size="sm" />
                    <span className="text-xs font-semibold text-green-700">Reviewed ✓</span>
                    <button
                      onClick={() => setModal({ id: a.id, mode: "view" })}
                      className="text-xs font-semibold text-coral-dark hover:underline"
                    >
                      View My Review
                    </button>
                    {canEditReview(review.firstSubmittedAt, allStatuses(review)) && (
                      <button
                        onClick={() => setModal({ id: a.id, mode: "edit" })}
                        className="text-xs font-semibold text-coral-dark hover:underline"
                      >
                        Edit Review
                      </button>
                    )}
                  </div>
                  {review.reward &&
                    (review.reward.status === "evaluated" || review.reward.status === "needs_review") &&
                    review.reward.points > 0 && (
                      <p className="text-xs font-semibold text-gold">+{review.reward.points} GlowPoints</p>
                    )}
                  {review.reward?.status === "pending" && <p className="text-xs text-ink/50">Reward pending</p>}
                  {partHidden && (
                    <p className="text-xs text-ink/50">Part of this review was hidden by GlowSync</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {appointments.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-champagne py-2.5 text-sm font-semibold text-coral-dark hover:bg-cream"
          >
            {showAll ? "Show less" : `Show all ${appointments.length} services`}
            <ChevronDown className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {modal && modalAppointment && (
        <VisitReviewModal
          key={`${modal.id}-${modal.mode}`}
          appointment={modalAppointment}
          clientId={clientId}
          existing={reviews[modal.id]}
          mode={modal.mode}
          onClose={() => {
            setModal(null);
            // Drop ?review= so the same "View Review" link can open it again.
            if (openReviewId) router.replace("/my-glow#services", { scroll: false });
          }}
          onViewRewards={() => setModal(null)}
          onSaved={async () => {
            await refresh();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
