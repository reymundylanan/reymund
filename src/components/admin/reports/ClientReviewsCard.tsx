import Link from "next/link";
import { Star } from "lucide-react";
import type { ReviewsSummary } from "@/lib/supabase/queries/reports";

export default function ClientReviewsCard({ reviews }: { reviews: ReviewsSummary }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Client Reviews</h2>
        <Link href="/admin/reviews" className="text-sm font-medium text-coral-dark hover:underline">
          Manage reviews →
        </Link>
      </div>
      <p className="mt-1 text-xs text-ink/50">
        Service ★ {reviews.byType.service.average} ({reviews.byType.service.count}) · Staff ★ {reviews.byType.staff.average} (
        {reviews.byType.staff.count}) · Branch ★ {reviews.byType.branch.average} ({reviews.byType.branch.count})
      </p>

      {reviews.count === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-ink/40">No reviews submitted yet.</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-semibold text-ink">{reviews.average}</p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-3.5 w-3.5 ${n <= Math.round(reviews.average) ? "fill-gold text-gold" : "text-ink/15"}`}
                  />
                ))}
              </div>
              <p className="text-xs text-ink/40">{reviews.count} review{reviews.count !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 space-y-1">
              {reviews.breakdown.map((b) => (
                <div key={b.stars} className="flex items-center gap-2 text-xs">
                  <span className="w-8 text-ink/50">{b.stars}★</span>
                  <div className="h-1.5 flex-1 rounded-full bg-ink/5">
                    <div
                      className="h-1.5 rounded-full bg-gold"
                      style={{ width: `${reviews.count > 0 ? (b.count / reviews.count) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-5 text-right text-ink/40">{b.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3 border-t border-ink/10 pt-4">
            <p className="text-xs font-semibold uppercase text-ink/40">Recent Reviews</p>
            {reviews.recent.map((r, i) => (
              <div key={i} className="rounded-xl border border-ink/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{r.clientName}</p>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-3 w-3 ${n <= r.rating ? "fill-gold text-gold" : "text-ink/15"}`} />
                    ))}
                  </div>
                </div>
                {r.text && <p className="mt-1 text-sm text-ink/60">{r.text}</p>}
                <p className="mt-1 text-xs text-ink/40">{r.date}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
