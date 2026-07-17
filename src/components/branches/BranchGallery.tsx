import { Star } from "lucide-react";

export default function BranchGallery({
  name = "Blush Spa Aesthetics - Pagadian",
  hours,
}: {
  name?: string;
  hours?: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-10">
      <h1 className="text-3xl font-semibold text-ink">{name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink/60">
        <span className="inline-flex items-center gap-1 font-semibold text-ink">
          5.0
          <span className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-gold text-gold" />
            ))}
          </span>
          (3)
        </span>
        {hours && <span>&bull; Open {hours}</span>}
      </div>

      <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="h-72 rounded-2xl bg-gradient-to-br from-rose to-coral" />
        <div className="grid gap-3">
          <div className="h-[8.5rem] rounded-2xl bg-gradient-to-br from-coral to-ink/40" />
          <div className="h-[8.5rem] rounded-2xl bg-gradient-to-br from-ink/30 to-coral-dark" />
        </div>
        <button className="absolute bottom-4 right-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-ink shadow-sm">
          See all images
        </button>
      </div>
    </section>
  );
}
