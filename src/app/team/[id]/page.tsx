import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { getPublicStaffProfile } from "@/lib/supabase/queries/staffProfiles";

export const dynamic = "force-dynamic";

function StarRow({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? "fill-gold text-gold" : "text-ink/15"}`} />
      ))}
    </span>
  );
}

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getPublicStaffProfile(supabase, id);
  if (!profile) notFound();
  const { staff, summary, reviews } = profile;

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link href="/#team" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to the team
          </Link>

          <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-8 text-center shadow-sm sm:flex-row sm:text-left">
            <span className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-3xl font-bold text-coral-dark">
              {staff.avatarUrl ? (
                <Image src={staff.avatarUrl} alt={staff.fullName} fill sizes="96px" className="object-cover" />
              ) : (
                staff.fullName.charAt(0).toUpperCase()
              )}
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-ink">{staff.fullName}</h1>
              <p className="text-sm text-ink/60">
                {staff.department}
                {staff.branchName && <> · {staff.branchName}</>}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start">
                <StarRow value={summary.average} />
                <span className="text-sm text-ink/60">
                  {summary.count > 0 ? `${summary.average} · ${summary.count} review${summary.count === 1 ? "" : "s"}` : "No reviews yet"}
                </span>
              </div>
            </div>
          </div>

          {summary.count > 0 && (
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="font-semibold text-ink">Rating breakdown</h2>
              <div className="mt-3 space-y-1">
                {summary.breakdown.map((b) => (
                  <div key={b.stars} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-ink/50">{b.stars}★</span>
                    <div className="h-1.5 flex-1 rounded-full bg-ink/5">
                      <div className="h-1.5 rounded-full bg-gold" style={{ width: `${(b.count / summary.count) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-ink/40">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="font-semibold text-ink">Client reviews</h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-sm text-ink/50">No reviews yet.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="border-b border-ink/5 pb-4 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{r.reviewer}</span>
                      <StarRow value={r.rating} size="h-3.5 w-3.5" />
                    </div>
                    {r.text && <p className="mt-1 text-sm text-ink/70">{r.text}</p>}
                    <p className="mt-1 text-xs text-ink/40">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
