import { Star, User } from "lucide-react";
import { reviews } from "@/lib/data";

export default function Reviews() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <h2 className="text-3xl font-semibold text-ink">Reviews</h2>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-5 w-5 fill-gold text-gold" />
          ))}
        </div>
        <span className="font-semibold text-ink">5.0</span>
        <span className="text-ink/50">(3)</span>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="rounded-2xl border border-ink/10 p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/10 text-ink/40">
                <User className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-ink">{review.name}</p>
                <p className="text-xs text-ink/50">{review.date}</p>
              </div>
            </div>
            <div className="mt-3 flex">
              {Array.from({ length: review.rating }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-gold text-gold" />
              ))}
            </div>
            <p className="mt-3 text-sm text-ink/70">{review.text}</p>
            <a
              href="#"
              className="mt-2 inline-block text-sm font-medium text-coral-dark"
            >
              Read more
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
