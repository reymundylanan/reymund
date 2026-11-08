import type { HomeOverview } from "@/lib/supabase/queries/homeOverview";
import CtaBookButton from "@/components/home/CtaBookButton";

/** Closing banner — every number here is live, not a slogan. */
export default function Cta({ overview }: { overview: HomeOverview }) {
  const { reviews, treatments, specialists, branches } = overview;
  const stats = [
    reviews.average != null && reviews.count > 0 && { value: `${reviews.average.toFixed(1)}/5`, label: `from ${reviews.count} client review${reviews.count === 1 ? "" : "s"}` },
    treatments > 0 && { value: String(treatments), label: "Treatments" },
    specialists > 0 && { value: String(specialists), label: "Specialists" },
    branches.length > 0 && { value: String(branches.length), label: `Branch${branches.length === 1 ? "" : "es"} in Pagadian` },
  ].filter((s): s is { value: string; label: string } => !!s);

  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div className="rounded-3xl bg-gradient-to-br from-[#3a2a22] via-[#2c2018] to-[#1f1610] px-8 py-16 text-center text-white">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold sm:text-4xl">Ready to Synchronize Your Senses and Reclaim Your Glow?</h2>
        <p className="mx-auto mt-4 max-w-xl text-white/75">
          Book online in a few taps, earn GlowPoints for your reviews, and keep your treatment history in My Glow.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <CtaBookButton />
        </div>

        {stats.length > 0 && (
          <div className="mt-12 flex flex-wrap justify-center gap-x-12 gap-y-6">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-sm text-white/65">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
