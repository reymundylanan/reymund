"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, MoreHorizontal, Star } from "lucide-react";
import PhotoLightbox from "@/components/reviews/PhotoLightbox";
import ReportReviewButton from "@/components/reviews/ReportReviewButton";
import type { PublicServiceReview } from "@/lib/supabase/queries/serviceReviews";
import type { StarFilter } from "@/lib/reviews";

type Page = { reviews: PublicServiceReview[]; hasMore: boolean };

const FILTERS: { value: StarFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: 5, label: "5★" },
  { value: 4, label: "4★" },
  { value: 3, label: "3★" },
  { value: 2, label: "2★" },
  { value: 1, label: "1★" },
  { value: "photos", label: "With Photos" },
];

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-4 w-4 ${n <= value ? "fill-gold text-gold" : "text-ink/15"}`} />
      ))}
    </span>
  );
}

export default function ServiceReviewsSection({ serviceId, initial }: { serviceId: string; initial: Page }) {
  const [filter, setFilter] = useState<StarFilter>("all");
  const [page, setPage] = useState<Page>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);
  const requestId = useRef(0);

  async function fetchPage(f: StarFilter, offset: number): Promise<Page | null> {
    const res = await fetch(`/api/reviews/service/${serviceId}?filter=${f}&offset=${offset}`);
    if (!res.ok) return null;
    return (await res.json()) as Page;
  }

  async function changeFilter(f: StarFilter) {
    if (f === filter) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    const next = await fetchPage(f, 0).catch(() => null);
    if (id !== requestId.current) return;
    setLoading(false);
    // Only switch the active filter once its reviews arrived, so the chips
    // never disagree with the list being shown.
    if (next) {
      setFilter(f);
      setPage(next);
    } else setError(true);
  }

  async function loadMore() {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    const next = await fetchPage(filter, page.reviews.length).catch(() => null);
    if (id !== requestId.current) return;
    setLoading(false);
    if (next) {
      const seen = new Set(page.reviews.map((r) => r.id));
      setPage({ reviews: [...page.reviews, ...next.reviews.filter((r) => !seen.has(r.id))], hasMore: next.hasMore });
    } else setError(true);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={String(f.value)}
            aria-pressed={filter === f.value}
            onClick={() => changeFilter(f.value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value ? "border-coral bg-coral text-white" : "border-ink/10 bg-white text-ink/70 hover:border-coral"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {page.reviews.length === 0 && !loading ? (
        <p className="mt-6 text-sm text-ink/50">{filter === "all" ? "No reviews yet." : "No reviews match this filter."}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {page.reviews.map((r) => (
            <li key={r.id} id={`review-${r.id}`} className="rounded-2xl border border-ink/5 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{r.reviewer}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blush px-2 py-0.5 text-xs font-medium text-coral-dark">
                      <BadgeCheck className="h-3 w-3" /> Verified Service
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-xs text-ink/40">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" })}
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
                    <div
                      className={`absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-lg ${reporting ? "hidden" : ""}`}
                    >
                      <ReportReviewButton
                        reviewId={r.id}
                        onOpenChange={(open) => {
                          setReporting(open);
                          if (!open) setMenuFor(null);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {r.text && <p className="mt-3 text-sm text-ink/80">{r.text}</p>}

              {r.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.photos.map((url, i) => (
                    <button
                      key={url}
                      onClick={() => setLightbox({ photos: r.photos, index: i })}
                      aria-label={`Open photo ${i + 1}`}
                      className="relative h-20 w-20 overflow-hidden rounded-xl bg-blush"
                    >
                      <Image src={url} alt="" fill sizes="80px" unoptimized className="object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {r.staffName && r.staffId && (
                <p className="mt-3 text-xs text-ink/50">
                  Served by{" "}
                  <Link href={`/team/${r.staffId}`} className="font-medium text-coral-dark hover:underline">
                    {r.staffName}
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-4 text-sm text-red-600">Couldn&apos;t load reviews. Please try again.</p>}
      {loading && <p className="mt-4 text-sm text-ink/50">Loading...</p>}
      {page.hasMore && !loading && (
        <button onClick={loadMore} className="mt-6 rounded-full border border-coral px-6 py-2 text-sm font-semibold text-coral-dark hover:bg-blush">
          Load More Reviews
        </button>
      )}

      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos.map((url) => ({ url }))}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
