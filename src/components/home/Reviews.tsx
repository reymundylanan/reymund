import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getReviewHighlights } from "@/lib/supabase/queries/publicContent";

/** Home → Reviews: real recent 4–5★ client reviews. */
export default async function Reviews() {
  const { highlights, stats } = await getReviewHighlights(await createClient(), 4);

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-coral-dark">Client Love</p>
      <h2 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Reviews</h2>
      {stats.count > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-5 w-5 ${i < Math.round(stats.average ?? 0) ? "fill-gold text-gold" : "text-nude"}`} />
            ))}
          </div>
          <span className="font-semibold text-ink">{stats.average?.toFixed(1)}</span>
          <span className="text-ink/55">
            ({stats.count} review{stats.count === 1 ? "" : "s"})
          </span>
        </div>
      )}

      {highlights.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-skin/60 p-8 text-center text-ink/70">
          Be the first to share your experience — reviews appear here after your visit.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {highlights.map((r) => (
            <div key={r.id} className="rounded-3xl border border-nude/70 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-skin font-semibold text-coral-dark">
                  {r.reviewer.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-medium text-ink">{r.reviewer}</p>
                  <p className="text-xs text-ink/55">
                    {r.date}
                    {r.about ? ` · ${r.about}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-gold text-gold" />
                ))}
              </div>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-ink/75">&ldquo;{r.text}&rdquo;</p>
            </div>
          ))}
        </div>
      )}

      <Link href="/services" className="mt-6 inline-block text-sm font-semibold text-coral-dark hover:underline">
        See reviews on each service →
      </Link>
    </section>
  );
}
