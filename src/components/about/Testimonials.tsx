import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getReviewHighlights } from "@/lib/supabase/queries/publicContent";

/** About → Voices of Relaxation: real recent 4–5★ client reviews. */
export default async function Testimonials() {
  const { highlights } = await getReviewHighlights(await createClient(), 3);

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold text-ink">Voices of Relaxation</h2>
        <p className="mx-auto mt-2 max-w-xl text-ink/60">Real stories from our beloved clients across Pagadian City.</p>
        <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-coral" />
      </div>

      {highlights.length === 0 ? (
        <p className="mx-auto mt-10 max-w-xl rounded-2xl bg-skin/60 p-8 text-center text-ink/70">
          Client stories will appear here as reviews come in.
        </p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {highlights.map((t) => (
            <div key={t.id} className="rounded-3xl border border-nude/70 bg-white p-6 shadow-sm">
              <div className="flex">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-gold text-gold" />
                ))}
              </div>
              <p className="mt-4 line-clamp-5 text-sm leading-relaxed text-ink/75">&ldquo;{t.text}&rdquo;</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-skin text-sm font-semibold text-coral-dark">
                  {t.reviewer.charAt(0).toUpperCase()}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{t.reviewer}</span>
                  {t.about && <span className="block text-xs text-ink/55">{t.about}</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
