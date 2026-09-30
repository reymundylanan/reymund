import Link from "next/link";
import { Star } from "lucide-react";

export default function NewReviewsCard({ count }: { count: number }) {
  return (
    <Link href="/admin/reviews?status=new" className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm hover:bg-blush/40">
      <span className="flex items-center gap-2 font-semibold text-ink">
        <Star className="h-5 w-5 text-gold" /> New reviews
      </span>
      <span className={`text-2xl font-semibold ${count > 0 ? "text-coral-dark" : "text-ink/40"}`}>{count}</span>
    </Link>
  );
}
