"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Quote, Star } from "lucide-react";
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
      <div className="space-y-3" aria-label="Loading profile">
        <div className="h-28 animate-pulse rounded-3xl bg-[#f6ead8]" />
        <div className="h-24 animate-pulse rounded-3xl bg-[#f6ead8]" />
      </div>
    );
  }

  const summary = data?.summary ?? { average: 0, count: 0, breakdown: [] };
  const reviews = data?.reviews ?? [];
  const quote = pickQuote(reviews.map((r) => ({ rating: r.rating, text: r.text, reviewer: r.reviewer, createdAt: r.createdAt })));
  const facts = staffFacts({ fullName, department, branchName, average: summary.average, count: summary.count, quote, categories });
  const servicesReviewed = Array.from(new Set(reviews.map((r) => r.serviceName).filter((s): s is string => !!s))).slice(0, 4);

  const section = "text-[11px] font-bold uppercase tracking-[0.16em] text-[#a97c1c]";

  return (
    <div className="space-y-5 text-left">
      {/* GlowSync AI: why pick them — a small mascot with a speech bubble */}
      <div className="flex items-end gap-1">
        <span className="-mb-1 shrink-0">
          <PlayfulMascot size={92} pose="present" label="Play with GlowSync AI" />
        </span>
        <div className="relative mb-3 min-w-0 flex-1 rounded-3xl rounded-bl-md bg-gradient-to-br from-white to-[#fff6e8] p-4 shadow-sm ring-1 ring-[#efdcc6]">
          <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[#a97c1c]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#e9bc4c]" /> GlowSync AI
          </p>
          <p className="mt-1 font-display text-[17px] font-semibold leading-tight text-ink">Why pick {fullName}?</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink/75">{facts.why}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/75">{facts.specialties}</p>
        </div>
      </div>

      {/* Rating */}
      <section>
        <p className={section}>Client rating</p>
        {summary.count > 0 ? (
          <div className="mt-2 flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#efdcc6]">
            <div className="flex w-24 shrink-0 flex-col items-center border-r border-[#f1e4cc] pr-4">
              <p className="font-display text-4xl font-semibold leading-none text-ink">{summary.average.toFixed(1)}</p>
              <span className="mt-1.5">
                <Stars value={summary.average} size="h-3.5 w-3.5" />
              </span>
              <p className="mt-1 text-[11px] text-ink/55">
                {summary.count} review{summary.count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {summary.breakdown.map((b) => (
                <div key={b.stars} className="flex items-center gap-2 text-[11px] text-ink/60">
                  <span className="flex w-6 items-center justify-end gap-0.5 tabular-nums">
                    {b.stars}
                    <Star className="h-2.5 w-2.5 fill-[#d4a537] text-[#d4a537]" aria-hidden />
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#f5ecdc]">
                    <span className="block h-full rounded-full bg-gradient-to-r from-[#f0d27e] to-[#c9a24a]" style={{ width: `${(b.count / summary.count) * 100}%` }} />
                  </span>
                  <span className="w-4 text-right tabular-nums">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 rounded-3xl bg-white p-4 text-center text-[13px] text-ink/60 ring-1 ring-[#efdcc6]">
            No reviews yet — be one of the first to review {fullName}.
          </p>
        )}
      </section>

      {/* What they do */}
      {(categories.length > 0 || servicesReviewed.length > 0) && (
        <section>
          {categories.length > 0 && (
            <>
              <p className={section}>Specialties at this branch</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {categories.slice(0, 8).map((c) => (
                  <span key={c} className="rounded-full bg-[#fbf1dc] px-3 py-1 text-xs font-semibold text-[#8a6a1c] ring-1 ring-[#efd9a8]">
                    {c}
                  </span>
                ))}
              </div>
            </>
          )}
          {servicesReviewed.length > 0 && (
            <p className="mt-2 text-xs text-ink/55">Clients reviewed {fullName} for {listJoin(servicesReviewed)}.</p>
          )}
        </section>
      )}

      {/* Recent reviews */}
      {reviews.length > 0 && (
        <section className="space-y-2">
          <p className={section}>What clients say</p>
          {reviews.slice(0, 3).map((r) => (
            <figure key={r.id} className="relative rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[#f1e4cc]">
              <Quote aria-hidden className="absolute right-4 top-4 h-5 w-5 text-[#f0e0bd]" />
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fbf1dc] text-sm font-bold text-[#8a6a1c]">
                  {(r.reviewer || "C").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{r.reviewer}</p>
                  <div className="flex items-center gap-2">
                    <Stars value={r.rating} size="h-3 w-3" />
                    <span className="text-[10.5px] text-ink/45">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>
              </div>
              {r.text && <blockquote className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink/75">{r.text}</blockquote>}
              {r.serviceName && (
                <figcaption className="mt-2 inline-block rounded-full bg-[#faf5ec] px-2.5 py-0.5 text-[11px] text-ink/55">{r.serviceName}</figcaption>
              )}
            </figure>
          ))}
          {reviews.length > 3 && (
            <Link href={`/team/${staffId}`} target="_blank" className="block pt-1 text-center text-xs font-bold text-[#a97c1c] hover:underline">
              See all {reviews.length} reviews →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
