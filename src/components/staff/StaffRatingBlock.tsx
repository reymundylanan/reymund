"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isPublicStatus, summarizeRatings } from "@/lib/reviews";
import { getStaffReviews, type StaffReviewItem } from "@/lib/supabase/queries/staffReviews";

const PAGE = 5;

function formatDate(value: string): string {
  // Date-only values ("2026-09-29") are calendar dates; timestamps are shown in Manila time.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+08:00`) : new Date(value);
  return d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" });
}

function Stars({ value, size = "h-3.5 w-3.5" }: { value: number; size?: string }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? "fill-gold text-gold" : "text-ink/15"}`} />
      ))}
    </span>
  );
}

export default function StaffRatingBlock({
  staffId,
  showManageLink,
  includeHidden = false,
}: {
  staffId: string;
  showManageLink: boolean;
  /** Admin only: also list hidden and removed reviews (with a status badge). */
  includeHidden?: boolean;
}) {
  const [items, setItems] = useState<StaffReviewItem[] | null>(null);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    getStaffReviews(createClient(), staffId, includeHidden).then((list) => {
      if (!cancelled) setItems(list);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId, includeHidden]);

  if (items === null) return <div className="rounded-2xl bg-white p-5 text-sm text-ink/40 shadow-sm">Loading reviews…</div>;

  // The rating is what the public sees: visible and flagged reviews only.
  const summary = summarizeRatings(items.filter((r) => isPublicStatus(r.status)).map((r) => r.rating));

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Client Reviews</h3>
        {showManageLink && (
          <Link href={`/admin/reviews?staff=${staffId}`} className="text-xs font-medium text-coral-dark hover:underline">
            View all reviews →
          </Link>
        )}
      </div>

      {summary.count === 0 ? (
        <p className="mt-2 text-sm text-ink/50">No reviews yet</p>
      ) : (
        <div className="mt-3 flex items-center gap-4">
          <div className="text-center">
            <p className="text-3xl font-semibold text-ink">{summary.average}</p>
            <Stars value={summary.average} />
            <p className="mt-1 text-xs text-ink/50">
              {summary.count} review{summary.count === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex-1 space-y-1">
            {summary.breakdown.map((b) => (
              <div key={b.stars} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-ink/50">{b.stars}★</span>
                <div className="h-1.5 flex-1 rounded-full bg-ink/5">
                  <div className="h-1.5 rounded-full bg-gold" style={{ width: `${(b.count / summary.count) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-ink/40">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.slice(0, shown).map((r) => (
            <li key={r.id} className="rounded-xl border border-ink/10 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{r.reviewer}</span>
                <span className="flex items-center gap-2">
                  {r.status !== "visible" && (
                    <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink/50">
                      {r.status}
                    </span>
                  )}
                  <Stars value={r.rating} size="h-3 w-3" />
                </span>
              </div>
              {(r.serviceName || r.serviceDate) && (
                <p className="mt-1 text-ink/50">
                  {[r.serviceName, r.serviceDate ? formatDate(r.serviceDate) : null].filter(Boolean).join(" · ")}
                </p>
              )}
              {r.text && <p className="mt-1 text-ink/70">{r.text}</p>}
              <p className="mt-1 text-ink/40">
                {formatDate(r.createdAt)}
                {r.editedAt && " · Edited"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {items.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-3 w-full rounded-full border border-ink/15 py-1.5 text-xs font-medium text-ink/60 hover:border-coral hover:text-coral-dark"
        >
          Show more
        </button>
      )}
    </div>
  );
}
