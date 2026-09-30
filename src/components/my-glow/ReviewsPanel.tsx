import { Star } from "lucide-react";
import type { MyReview } from "@/lib/supabase/queries/myGlow";

const TYPE_LABEL = { service: "Service", staff: "Therapist", branch: "Branch" } as const;

export default function ReviewsPanel({ myReviews }: { myReviews: MyReview[] }) {
  return (
    <div id="reviews" className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="text-lg font-semibold text-ink">My Reviews</h3>
      <p className="mt-1 text-sm text-ink/50">
        Rate your completed visits in <a href="#services" className="font-medium text-coral-dark hover:underline">My Services</a>.
      </p>

      <div className="mt-4 space-y-3">
        {myReviews.length === 0 && <p className="py-6 text-center text-sm text-ink/40">No reviews yet.</p>}
        {myReviews.map((r) => (
          <div key={r.id} className="rounded-2xl border border-ink/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                <span className="mr-1.5 rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold text-coral-dark">
                  {TYPE_LABEL[r.targetType]}
                </span>
                {r.targetName}
              </p>
              <div className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-gold text-gold" : "text-ink/20"}`} />
                ))}
              </div>
            </div>
            {r.status === "visible" ? (
              r.text && <p className="mt-1 text-sm text-ink/60">{r.text}</p>
            ) : (
              <p className="mt-1 text-xs text-ink/40">Hidden by the spa</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
