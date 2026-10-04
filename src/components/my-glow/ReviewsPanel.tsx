"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, EyeOff, MessageSquareQuote, Sparkles, Star } from "lucide-react";
import { isPublicStatus } from "@/lib/reviews";
import type { MyReview } from "@/lib/supabase/queries/myGlow";

const TYPE_LABEL = { service: "Service", staff: "Therapist", branch: "Branch" } as const;
const TYPE_STYLE = {
  service: "bg-[#fbf1dc] text-coral-dark",
  staff: "bg-[#f3ecff] text-[#7a4fc4]",
  branch: "bg-[#e9f4ef] text-[#2f7d5b]",
} as const;

/** Reviews shown before "Show all". */
const PREVIEW_COUNT = 3;

function Stars({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) {
  return (
    <span className="flex" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= rating ? "fill-gold text-gold" : "text-ink/15"}`} />
      ))}
    </span>
  );
}

export default function ReviewsPanel({ myReviews }: { myReviews: MyReview[] }) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const average = myReviews.length ? myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length : 0;
  const shown = showAll ? myReviews : myReviews.slice(0, PREVIEW_COUNT);

  return (
    <div id="reviews" className="rounded-3xl border border-rose/60 bg-white p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="my-reviews-list"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <MessageSquareQuote className="h-5 w-5 text-coral-dark" /> My Reviews
          {myReviews.length > 0 && (
            <span className="rounded-full bg-skin px-2 py-0.5 text-xs font-semibold text-coral-dark">{myReviews.length}</span>
          )}
        </h3>
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-champagne px-3 py-1 text-xs font-semibold text-ink/70 hover:border-coral">
          {open ? "Hide" : "Show"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      <div id="my-reviews-list" hidden={!open}>
        {myReviews.length > 0 ? (
          // Summary: average and how many reviews.
          <div className="mt-4 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-cream via-[#fbf1dc] to-[#f6e3b8] px-4 py-3">
            <span className="text-3xl font-bold text-coral-dark">{average.toFixed(1)}</span>
            <span>
              <Stars rating={Math.round(average)} />
              <span className="mt-0.5 block text-xs text-ink/60">
                Your average from {myReviews.length} review{myReviews.length !== 1 ? "s" : ""} · thank you! 💕
              </span>
            </span>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center rounded-2xl bg-cream px-4 py-6 text-center">
            <Sparkles className="h-6 w-6 text-coral-dark" />
            <p className="mt-2 text-sm font-semibold text-ink">No reviews yet</p>
            <p className="mt-1 text-xs text-ink/55">
              Rate a completed visit in <a href="#services" className="font-semibold text-coral-dark hover:underline">My Services</a> and earn
              GlowPoints.
            </p>
          </div>
        )}

        <div className="mt-3 space-y-3">
          {shown.map((r) => {
            const visible = isPublicStatus(r.status);
            return (
              <article key={r.id} className="rounded-2xl border border-ink/10 bg-white p-3.5 shadow-sm shadow-ink/[0.03]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_STYLE[r.targetType]}`}>
                      {TYPE_LABEL[r.targetType]}
                    </span>
                    <p className="mt-1 truncate text-sm font-semibold text-ink">{r.targetName}</p>
                  </div>
                  <Stars rating={r.rating} size="h-3.5 w-3.5" />
                </div>

                {visible ? (
                  r.text && (
                    <blockquote className="mt-2 border-l-2 border-champagne pl-3 text-sm italic leading-relaxed text-ink/70 line-clamp-3">
                      &ldquo;{r.text}&rdquo;
                    </blockquote>
                  )
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-ink/45">
                    <EyeOff className="h-3.5 w-3.5" /> Hidden by GlowSync
                  </p>
                )}

                {r.photos.length > 0 && (
                  <div className="mt-2.5 flex gap-1.5">
                    {r.photos.slice(0, 4).map((url) => (
                      <Image
                        key={url}
                        src={url}
                        alt="Review photo"
                        width={52}
                        height={52}
                        unoptimized
                        className="h-[52px] w-[52px] rounded-xl object-cover ring-1 ring-ink/5"
                      />
                    ))}
                    {r.photos.length > 4 && (
                      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-skin text-xs font-semibold text-coral-dark">
                        +{r.photos.length - 4}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-ink/5 pt-2 text-xs text-ink/45">
                  <span>
                    {new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" })}
                    {r.editedAt && " · Edited"}
                  </span>
                  {r.appointmentId && (
                    <Link href={`/my-glow?review=${r.appointmentId}#services`} className="font-semibold text-coral-dark hover:underline">
                      View review →
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
          {myReviews.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-champagne py-2.5 text-sm font-semibold text-coral-dark hover:bg-cream"
            >
              {showAll ? "Show less" : `Show all ${myReviews.length} reviews`}
              <ChevronDown className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
