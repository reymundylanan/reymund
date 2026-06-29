import { Star, User } from "lucide-react";
import { testimonials } from "@/lib/data";

export default function Testimonials() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold text-ink">
          Voices of Relaxation
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-ink/60">
          Real stories from our beloved clients across Pagadian City.
        </p>
        <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-coral" />
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {testimonials.map((t) => (
          <div key={t.id} className="rounded-2xl border border-ink/10 p-6">
            <div className="flex">
              {Array.from({ length: t.rating }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-gold text-gold" />
              ))}
            </div>
            <p className="mt-4 text-sm text-ink/70">&ldquo;{t.text}&rdquo;</p>
            <div className="mt-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/10 text-ink/40">
                <User className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-ink">{t.author}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
