"use client";

import { useState } from "react";
import { BadgeCheck, MoreHorizontal, Star } from "lucide-react";
import ReportReviewButton from "@/components/reviews/ReportReviewButton";
import type { PublicStaffReview } from "@/lib/supabase/queries/staffProfiles";

const PAGE_SIZE = 10;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" });
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? "fill-gold text-gold" : "text-ink/15"}`} />
      ))}
    </span>
  );
}

export default function StaffReviewList({ reviews }: { reviews: PublicStaffReview[] }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  if (reviews.length === 0) return <p className="mt-3 text-sm text-ink/50">No reviews yet.</p>;

  return (
    <div>
      <ul className="mt-4 space-y-4">
        {reviews.slice(0, shown).map((r) => {
          const context = [r.serviceName, r.serviceDate ? formatDate(r.serviceDate) : null].filter(Boolean).join(" · ");
          return (
            <li key={r.id} className="border-b border-ink/5 pb-4 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{r.reviewer}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blush px-2 py-0.5 text-xs font-medium text-coral-dark">
                      <BadgeCheck className="h-3 w-3" /> Verified Service
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-xs text-ink/40">
                      {formatDate(r.createdAt)}
                      {r.editedAt && " · Edited"}
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                    aria-label="More options"
                    aria-expanded={menuFor === r.id}
                    className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  {menuFor === r.id && (
                    <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-lg">
                      <ReportReviewButton reviewId={r.id} />
                    </div>
                  )}
                </div>
              </div>
              {context && <p className="mt-2 text-xs text-ink/50">{context}</p>}
              {r.text && <p className="mt-1 text-sm text-ink/70">{r.text}</p>}
            </li>
          );
        })}
      </ul>
      {shown < reviews.length && (
        <button
          onClick={() => setShown((n) => n + PAGE_SIZE)}
          className="mt-6 rounded-full border border-coral px-6 py-2 text-sm font-semibold text-coral-dark hover:bg-blush"
        >
          Load More Reviews
        </button>
      )}
    </div>
  );
}
