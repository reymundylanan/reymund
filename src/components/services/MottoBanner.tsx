import { Flower2, Heart } from "lucide-react";

/** Closing motto on the Services page (replaced the old consultation CTA). */
export default function MottoBanner() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div className="relative overflow-hidden rounded-3xl border border-nude/70 bg-gradient-to-br from-skin via-cream to-champagne/60 px-8 py-14 text-center">
        <Flower2 className="mx-auto h-8 w-8 text-coral" aria-hidden />
        <h2 className="mt-4 text-3xl font-semibold italic text-coral-dark sm:text-4xl">
          Look Good. Feel Good. Be You.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-ink/70">
          At Blush Spa &amp; Aesthetics, every treatment is a moment just for you — crafted with care, so you leave
          glowing inside and out.
        </p>
        <p className="mt-6 flex items-center justify-center gap-2 text-sm font-medium tracking-wide text-coral-dark">
          <span className="h-px w-10 bg-champagne" aria-hidden />
          Your glow, our passion
          <Heart className="h-3.5 w-3.5" aria-hidden />
          <span className="h-px w-10 bg-champagne" aria-hidden />
        </p>
      </div>
    </section>
  );
}
