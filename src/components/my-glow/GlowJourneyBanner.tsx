import Link from "next/link";

export default function GlowJourneyBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-rose/40 p-6">
      <div>
        <p className="text-lg font-semibold text-ink">Your Glow Journey</p>
        <p className="text-sm text-ink/60">
          Track your wellness progress and unlock a more radiant you.
        </p>
      </div>
      <Link
        href="/my-glow/journey"
        className="rounded-full border border-coral px-5 py-2 text-sm font-semibold text-coral-dark hover:bg-blush"
      >
        View My Journey
      </Link>
    </div>
  );
}
