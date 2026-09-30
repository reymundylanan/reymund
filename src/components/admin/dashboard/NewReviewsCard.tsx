import Link from "next/link";
import { Star } from "lucide-react";

export default function NewReviewsCard({ count, flaggedCount = 0 }: { count: number; flaggedCount?: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
      <Link href="/admin/reviews?status=new" className="flex items-center gap-2 font-semibold text-ink hover:underline">
        <Star className="h-5 w-5 text-gold" /> New reviews
      </Link>
      <div className="flex items-center gap-4">
        {flaggedCount > 0 && (
          <Link href="/admin/reviews?status=flagged" className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 hover:bg-amber-200">
            {flaggedCount} flagged
          </Link>
        )}
        <Link href="/admin/reviews?status=new" className={`text-2xl font-semibold ${count > 0 ? "text-coral-dark" : "text-ink/40"}`}>
          {count}
        </Link>
      </div>
    </div>
  );
}
