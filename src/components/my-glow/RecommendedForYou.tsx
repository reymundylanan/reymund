import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { Recommendation } from "@/lib/supabase/queries/recommendations";
import { getServiceImage } from "@/lib/serviceImage";

const REASON_STYLE: Record<string, string> = {
  "Popular with You": "bg-amber-100 text-amber-700",
  "We Miss You": "bg-coral/10 text-coral-dark",
  "Similar to Your Last Service": "bg-blue-100 text-blue-700",
};

function reasonStyle(reason: string) {
  return REASON_STYLE[reason] ?? "bg-green-100 text-green-700";
}

export default function RecommendedForYou({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) return null;

  return (
    <div className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Sparkles className="h-5 w-5 text-coral-dark" /> Recommended for You
      </h3>
      <p className="mt-1 text-sm text-ink/50">Based on your recent bookings and services</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.map((r) => (
          <div key={r.id} className="flex flex-col overflow-hidden rounded-2xl border border-ink/10">
            <div className="relative h-32 w-full">
              <Image src={getServiceImage(r.category)} alt={r.name} fill className="object-cover" />
              <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${reasonStyle(r.reason)}`}>
                {r.reason}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-3">
              <p className="font-semibold text-ink">{r.name}</p>
              <p className="mt-0.5 text-xs text-ink/50">
                {r.reason === "We Miss You"
                  ? "It's been a while — come back for a refresh."
                  : r.reason === "Popular with You"
                  ? `Because you often book ${r.category.replace(" Services", "").toLowerCase()}`
                  : r.reason === "Similar to Your Last Service"
                  ? "Similar to what you booked last time"
                  : `Because you previously booked ${r.category.replace(" Services", "").toLowerCase()}`}
              </p>
              <div className="mt-auto flex items-center justify-between pt-3">
                <span className="font-semibold text-coral-dark">₱{r.price.toLocaleString()}</span>
                <Link
                  href={`/services?category=${encodeURIComponent(r.category)}`}
                  className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark"
                >
                  Book Now
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
