import { getTierProgress } from "@/lib/myGlowTiers";

export default function GlowRewardsCard({ points }: { points: number }) {
  const progress = getTierProgress(points);

  return (
    <div id="rewards" className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="text-lg font-semibold text-ink">My Glow Rewards</h3>
      <p className="mt-4 text-4xl font-bold text-coral-dark">
        {progress.points.toLocaleString()}
      </p>
      <p className="text-sm text-ink/60">Glow Points</p>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-blush">
        <div
          className="h-full rounded-full bg-coral"
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-sm text-ink/60">
        <span>{progress.tier} Member</span>
        {progress.nextTier ? (
          <span>
            {progress.pointsToNext} pts to {progress.nextTier}
          </span>
        ) : (
          <span>Max tier reached</span>
        )}
      </div>
    </div>
  );
}
