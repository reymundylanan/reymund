"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTierProgress } from "@/lib/myGlowTiers";
import { getPointsHistoryPage, type MyRewards, type PointsEntry } from "@/lib/supabase/queries/rewards";

import MyVouchersList from "@/components/my-glow/MyVouchersList";
import RedeemRewardsModal from "@/components/my-glow/RedeemRewardsModal";
import type { RedemptionState, Voucher } from "@/lib/supabase/queries/vouchers";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

export default function MyRewardsCard({
  initial,
  clientId,
  redemption,
  vouchers,
}: {
  initial: MyRewards;
  clientId: string;
  redemption: RedemptionState;
  vouchers: Voucher[];
}) {
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [history, setHistory] = useState<PointsEntry[]>(initial.history);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const progress = getTierProgress(initial.lifetimeEarned);

  async function showMore() {
    setLoading(true);
    setLoadError(false);
    const page = await getPointsHistoryPage(createClient(), clientId, history.length);
    if (page) {
      setHistory((prev) => [...prev, ...page.history.filter((e) => !prev.some((p) => p.id === e.id))]);
      setHasMore(page.hasMore);
    } else {
      setLoadError(true);
    }
    setLoading(false);
  }

  return (
    <div id="rewards" className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="text-lg font-semibold text-ink">My Rewards</h3>
      <p className="mt-4 text-sm text-ink/60">✨ GlowPoints</p>
      <p className="text-4xl font-bold text-coral-dark">{initial.balance.toLocaleString()}</p>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-blush">
        <div className="h-full rounded-full bg-coral" style={{ width: `${progress.progressPercent}%` }} />
      </div>
      <div className="mt-2 space-y-0.5 text-sm text-ink/60">
        <p className="font-medium text-ink">{progress.tier} Member</p>
        <p>
          {progress.nextTier
            ? `Earn ${progress.pointsToNext} more points to reach ${progress.nextTier}`
            : "Max tier reached"}
        </p>
      </div>

      <h4 className="mt-6 text-sm font-semibold text-ink">Points History</h4>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">No points yet — review a completed visit to earn GlowPoints.</p>
      ) : (
        <ul className="mt-2 divide-y divide-rose/40">
          {history.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-ink">{e.label}</p>
                <p className="text-xs text-ink/50">{formatDate(e.createdAt)}</p>
              </div>
              <span className={`shrink-0 font-semibold ${e.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                {e.points >= 0 ? `+${e.points}` : `−${Math.abs(e.points)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={showMore}
          disabled={loading}
          className="mt-2 text-sm font-medium text-coral-dark hover:underline disabled:opacity-60"
        >
          {loading ? "Loading…" : "Show more"}
        </button>
      )}
      {loadError && <p className="mt-1 text-xs text-red-600">Couldn&apos;t load more. Please try again.</p>}

      <MyVouchersList vouchers={vouchers} />

      {redemption ? (
        <button
          type="button"
          onClick={() => setRedeemOpen(true)}
          className="mt-5 w-full rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
        >
          Redeem Rewards
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled
            className="mt-5 w-full cursor-not-allowed rounded-full bg-blush px-4 py-2 text-sm font-semibold text-ink/40"
          >
            Redeem Rewards
          </button>
          <p className="mt-1 text-center text-xs text-ink/50">Coming soon</p>
        </>
      )}
      {redemption && redeemOpen && (
        <RedeemRewardsModal
          balance={initial.balance}
          enabled={redemption.enabled}
          options={redemption.options}
          onClose={() => setRedeemOpen(false)}
        />
      )}
    </div>
  );
}
