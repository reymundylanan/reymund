"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useMascotSize } from "@/components/guide/guideKit";
import { PlayfulMascot } from "@/components/guide/MascotPlay";
import { createClient } from "@/lib/supabase/client";
import { getPublicStaffProfile, type PublicStaffReview } from "@/lib/supabase/queries/staffProfiles";
import { listJoin, pickQuote, staffFacts } from "@/lib/staffGuide";

type Loaded = {
  summary: { average: number; count: number; breakdown: { stars: number; count: number }[] };
  reviews: PublicStaffReview[];
};

function Stars({ value, size = "h-3.5 w-3.5" }: { value: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= Math.round(value) ? "fill-[#d4a537] text-[#d4a537]" : "text-[#e8d9bd]"}`} />
      ))}
    </span>
  );
}

/** Inside booking's Staff Profile: why pick this professional, their rating,
 * what they do at this branch and recent client reviews — all real data. */
export default function StaffProfileDetails({
  staffId,
  fullName,
  department,
  branchName,
  categories,
}: {
  staffId: string;
  fullName: string;
  department: string;
  branchName: string | null;
  /** Service categories their department offers at this branch. */
  categories: string[];
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const mascotSize = useMascotSize();

  useEffect(() => {
    let cancelled = false;
    getPublicStaffProfile(createClient(), staffId)
      .then((res) => {
        if (cancelled) return;
        if (res) setData({ summary: res.summary, reviews: res.reviews });
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (!data && !failed) {
    return (
      <div className="space-y-2" aria-label="Loading profile">
        <div className="h-16 animate-pulse rounded-2xl bg-[#f6ead8]" />
        <div className="h-24 animate-pulse rounded-2xl bg-[#f6ead8]" />
      </div>
    );
  }

  const summary = data?.summary ?? { average: 0, count: 0, breakdown: [] };
  const reviews = data?.reviews ?? [];
  const quote = pickQuote(reviews.map((r) => ({ rating: r.rating, text: r.text, reviewer: r.reviewer, createdAt: r.createdAt })));
  const facts = staffFacts({ fullName, department, branchName, average: summary.average, count: summary.count, quote, categories });
  const servicesReviewed = Array.from(new Set(reviews.map((r) => r.serviceName).filter((s): s is string => !!s))).slice(0, 4);

  return (
    <div className="space-y-3 text-left">
      {/* GlowSync AI: why pick them */}
      <div className="flex items-end gap-2 rounded-2xl bg-gradient-to-br from-white via-[#fff8ee] to-[#fdf0f7] p-3 ring-1 ring-[#efdcc6]">
        <span className="shrink-0">
          <PlayfulMascot size={mascotSize} pose="present" label="Play with GlowSync AI" />
        </span>
        <div className="min-w-0 text-[13px] leading-snug text-ink/80">
          <p className="font-bold text-[#5b2d86]">Why pick {fullName}? ✨</p>
          <p className="mt-0.5">{facts.why}</p>
          <p className="mt-0.5">{facts.specialties}</p>
        </div>
      </div>

      {/* Rating breakdown */}
      {summary.count > 0 ? (
        <div className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-[#efdcc6]">
          <div className="flex w-20 shrink-0 flex-col items-center justify-center">
            <p className="text-3xl font-bold leading-none text-ink">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} size="h-3 w-3" />
            <p className="mt-1 text-[11px] text-ink/55">
              {summary.count} review{summary.count === 1 ? "" : "s"}
            </p>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {summary.breakdown.map((b) => (
              <div key={b.stars} className="flex items-center gap-2 text-[11px] text-ink/60">
                <span className="w-3 text-right tabular-nums">{b.stars}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f3e7d2]">
                  <span className="block h-full rounded-full bg-gradient-to-r from-[#f3d98b] to-[#c9a24a]" style={{ width: `${(b.count / summary.count) * 100}%` }} />
                </span>
                <span className="w-4 tabular-nums">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-white p-3 text-center text-xs text-ink/55 ring-1 ring-[#efdcc6]">No reviews yet — be one of the first to review {fullName}.</p>
      )}

      {/* What they do */}
      {(categories.length > 0 || servicesReviewed.length > 0) && (
        <div className="space-y-1.5">
          {categories.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#a97c1c]">Specialties at this branch</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.slice(0, 6).map((c) => (
                  <span key={c} className="rounded-full bg-[#f5effd] px-2.5 py-0.5 text-[11px] font-semibold text-[#5b2d86] ring-1 ring-[#e6d8f8]">
                    {c}
                  </span>
                ))}
              </div>
            </>
          )}
          {servicesReviewed.length > 0 && (
            <p className="text-[11.5px] text-ink/55">Clients reviewed {fullName} for {listJoin(servicesReviewed)}.</p>
          )}
        </div>
      )}

      {/* Recent reviews */}
      {reviews.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#a97c1c]">What clients say</p>
          {reviews.slice(0, 3).map((r) => (
            <figure key={r.id} className="rounded-2xl bg-[#fffaf3] p-3 ring-1 ring-[#f1dfb6]">
              <div className="flex items-center justify-between gap-2">
                <Stars value={r.rating} size="h-3 w-3" />
                <span className="text-[10.5px] text-ink/45">
                  {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              {r.text && <blockquote className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-ink/75">“{r.text}”</blockquote>}
              <figcaption className="mt-1 text-[11px] text-ink/50">
                — {r.reviewer}
                {r.serviceName && <> · {r.serviceName}</>}
              </figcaption>
            </figure>
          ))}
          {reviews.length > 3 && (
            <Link href={`/team/${staffId}`} target="_blank" className="block text-center text-xs font-bold text-[#a97c1c] hover:underline">
              See all {reviews.length} reviews →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
