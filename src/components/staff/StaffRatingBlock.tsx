"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { summarizeRatings, type ReviewStatus } from "@/lib/reviews";

type Row = { id: string; rating: number; text: string | null; status: ReviewStatus; created_at: string };

export default function StaffRatingBlock({ staffId, showManageLink }: { staffId: string; showManageLink: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("reviews")
      .select("id, rating, text, status, created_at")
      .eq("target_type", "staff")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("StaffRatingBlock load failed:", error);
        if (!cancelled) setRows((data as Row[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (rows === null) return <div className="rounded-2xl bg-white p-5 text-sm text-ink/40 shadow-sm">Loading rating…</div>;

  const visible = summarizeRatings(rows.filter((r) => r.status === "visible").map((r) => r.rating));

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Rating</h3>
        {showManageLink && (
          <Link href={`/admin/reviews?staff=${staffId}`} className="text-xs font-medium text-coral-dark hover:underline">
            View all reviews →
          </Link>
        )}
      </div>
      <p className="mt-2 flex items-center gap-1 text-sm text-ink">
        <Star className="h-4 w-4 fill-gold text-gold" />
        {visible.count > 0 ? `${visible.average} · ${visible.count} review${visible.count === 1 ? "" : "s"}` : "No reviews yet"}
      </p>
      <ul className="mt-3 space-y-2">
        {rows.slice(0, 5).map((r) => (
          <li key={r.id} className="rounded-xl border border-ink/10 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span>{"★".repeat(r.rating)}</span>
              {r.status !== "visible" && (
                <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink/50">{r.status}</span>
              )}
            </div>
            {r.text && <p className="mt-1 text-ink/60">{r.text}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
