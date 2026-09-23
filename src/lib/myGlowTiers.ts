export type TierName = "Bronze" | "Silver" | "Gold" | "Platinum";

export type TierProgress = {
  tier: TierName;
  points: number;
  nextTier: TierName | null;
  pointsToNext: number | null;
  progressPercent: number;
};

const TIERS: { name: TierName; threshold: number }[] = [
  { name: "Bronze", threshold: 0 },
  { name: "Silver", threshold: 1000 },
  { name: "Gold", threshold: 2000 },
  { name: "Platinum", threshold: 5000 },
];

export function getTierProgress(points: number): TierProgress {
  const safePoints = Math.max(0, points);

  let current = TIERS[0];
  for (const t of TIERS) {
    if (safePoints >= t.threshold) current = t;
  }
  const currentIndex = TIERS.findIndex((t) => t.name === current.name);
  const next = TIERS[currentIndex + 1] ?? null;

  if (!next) {
    return {
      tier: current.name,
      points: safePoints,
      nextTier: null,
      pointsToNext: null,
      progressPercent: 100,
    };
  }

  const band = next.threshold - current.threshold;
  const progressInBand = safePoints - current.threshold;
  const progressPercent = Math.min(100, Math.round((progressInBand / band) * 100));

  return {
    tier: current.name,
    points: safePoints,
    nextTier: next.name,
    pointsToNext: next.threshold - safePoints,
    progressPercent,
  };
}
