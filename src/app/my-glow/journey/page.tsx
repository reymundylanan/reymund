import { redirect } from "next/navigation";
import Link from "next/link";
import { Award, CalendarHeart, CheckCircle2, Circle, Heart, MapPin, Sparkles, Star, UserRound, Wallet } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { loginRedirectPath } from "@/lib/loginRedirect";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { getTierProgress } from "@/lib/myGlowTiers";
import { buildJourney, type JourneyVisit } from "@/lib/glowJourney";

export const dynamic = "force-dynamic";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (!v ? null : Array.isArray(v) ? (v[0] ?? null) : v);

function fmt(key: string | null) {
  if (!key) return "—";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function GlowJourneyPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginRedirectPath("/my-glow/journey"));
  const uid = auth.user.id;

  const [{ data: profile }, appts, reviews, payments] = await Promise.all([
    supabase.from("profiles").select("full_name, role, loyalty_points, created_at").eq("id", uid).single(),
    supabase
      .from("appointments")
      .select("id, scheduled_date, status, session_status, notes, professional:staff_members(full_name), branch:branches(name), service:branch_services(name), appointment_services(service_name, position)")
      .eq("client_id", uid)
      .order("scheduled_date", { ascending: false })
      .limit(500),
    supabase.from("reviews").select("appointment_id, created_at").eq("client_id", uid),
    supabase.from("payments").select("amount, status").eq("status", "settled"),
  ]);
  if (!profile || profile.role !== "customer") redirect("/");
  logQueryError("journey appointments", appts.error);
  logQueryError("journey reviews", reviews.error);
  logQueryError("journey payments", payments.error);

  type Row = {
    id: string;
    scheduled_date: string;
    status: string;
    session_status: string | null;
    notes: string | null;
    professional: Rel<{ full_name: string }>;
    branch: Rel<{ name: string }>;
    service: Rel<{ name: string }>;
    appointment_services: { service_name: string; position: number }[] | null;
  };
  const reviewRows = (reviews.data ?? []) as { appointment_id: string | null; created_at: string }[];
  const reviewed = new Set(reviewRows.map((r) => r.appointment_id));
  const visits: JourneyVisit[] = ((appts.data ?? []) as unknown as Row[])
    .filter((a) => a.status !== "cancelled" && (a.status === "completed" || a.session_status === "completed" || a.session_status === "paid"))
    .map((a) => {
      const listed = [...(a.appointment_services ?? [])].sort((x, y) => x.position - y.position).map((s) => s.service_name);
      return {
        id: a.id,
        date: a.scheduled_date,
        services: listed.length ? listed : [one(a.service)?.name ?? a.notes?.split(" with ")[0]?.trim() ?? "Visit"],
        staff: one(a.professional)?.full_name ?? null,
        branch: one(a.branch)?.name ?? null,
        reviewed: reviewed.has(a.id),
      };
    });

  // RLS limits payments to the client's own bookings (059).
  const totalSpent = ((payments.data ?? []) as { amount: number }[]).reduce((s, p) => s + Number(p.amount), 0);
  const j = buildJourney({
    visits,
    reviewDates: reviewRows.map((r) => new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })),
    totalSpent,
  });
  const tier = getTierProgress(profile.loyalty_points ?? 0);
  const firstName = profile.full_name?.split(" ")[0] ?? "there";

  const stats = [
    { icon: CalendarHeart, label: "Visits", value: String(j.totalVisits) },
    { icon: Sparkles, label: "Services Tried", value: String(j.servicesTried) },
    { icon: MapPin, label: "Branches Visited", value: String(j.branchesVisited) },
    { icon: Wallet, label: "Invested in You", value: `₱${j.totalSpent.toLocaleString("en-PH", { maximumFractionDigits: 0 })}` },
  ];

  return (
    <>
      <Header />
      <main className="flex-1 bg-cream px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <Link href="/my-glow" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to My Glow
          </Link>

          <section className="rounded-3xl border border-nude/70 bg-gradient-to-br from-skin via-cream to-champagne/50 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-coral-dark">Your Glow Journey</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">
              {j.totalVisits > 0 ? `Look how far you've glowed, ${firstName}!` : `Your journey starts here, ${firstName}.`}
            </h1>
            <p className="mt-2 text-ink/70">
              {j.firstVisit ? `Glowing with us since ${fmt(j.firstVisit)}.` : "Book your first visit to start collecting milestones."}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              {stats.map((s) => {
                const I = s.icon;
                return (
                  <div key={s.label} className="rounded-2xl bg-white/80 p-4 shadow-sm">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink/55">
                      <I className="h-4 w-4 text-coral-dark" /> {s.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-ink">{s.value}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <section className="rounded-3xl border border-nude/70 bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                <Award className="h-5 w-5 text-coral-dark" /> {tier.tier} Member
              </h2>
              <p className="mt-1 text-sm text-ink/65">{(profile.loyalty_points ?? 0).toLocaleString()} GlowPoints</p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-skin">
                <div className="h-full rounded-full bg-coral" style={{ width: `${tier.progressPercent}%` }} />
              </div>
              <p className="mt-2 text-xs text-ink/55">
                {tier.nextTier ? `${tier.pointsToNext} points to ${tier.nextTier}` : "You've reached the top tier!"}
              </p>

              <div className="mt-6 space-y-3 text-sm">
                <p className="flex items-center gap-2 text-ink/80">
                  <Heart className="h-4 w-4 text-coral-dark" /> Favorite treatment:{" "}
                  <span className="font-semibold text-ink">{j.favoriteService ? `${j.favoriteService.value} (${j.favoriteService.count}×)` : "—"}</span>
                </p>
                <p className="flex items-center gap-2 text-ink/80">
                  <UserRound className="h-4 w-4 text-coral-dark" /> Favorite therapist:{" "}
                  <span className="font-semibold text-ink">{j.favoriteStaff ? `${j.favoriteStaff.value} (${j.favoriteStaff.count}×)` : "—"}</span>
                </p>
              </div>

              {j.nextGoal && (
                <div className="mt-6 rounded-2xl bg-cream p-4">
                  <p className="text-sm font-semibold text-ink">Next milestone: {j.nextGoal.visits} visits</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-skin">
                    <div className="h-full rounded-full bg-coral" style={{ width: `${j.nextGoal.percent}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-ink/55">
                    {j.nextGoal.remaining} more visit{j.nextGoal.remaining === 1 ? "" : "s"} to go
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-nude/70 bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                <Star className="h-5 w-5 text-coral-dark" /> Milestones
              </h2>
              <ul className="mt-4 space-y-3">
                {j.milestones.map((m) => (
                  <li key={m.key} className={`flex items-center gap-3 rounded-2xl border p-3 ${m.achieved ? "border-champagne bg-skin/60" : "border-nude/60 bg-white"}`}>
                    {m.achieved ? <CheckCircle2 className="h-6 w-6 shrink-0 text-coral-dark" /> : <Circle className="h-6 w-6 shrink-0 text-nude" />}
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${m.achieved ? "text-ink" : "text-ink/55"}`}>{m.title}</span>
                      <span className="block text-xs text-ink/55">{m.detail}</span>
                    </span>
                    <span className="text-xs text-ink/55">{m.achieved ? fmt(m.date) : "Locked"}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="rounded-3xl border border-nude/70 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <CalendarHeart className="h-5 w-5 text-coral-dark" /> Your Visits
            </h2>
            {j.timeline.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-cream p-8 text-center">
                <p className="text-ink/70">No completed visits yet.</p>
                <Link href="/services" className="mt-3 inline-block rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
                  Explore Services
                </Link>
              </div>
            ) : (
              <ol className="mt-5 space-y-4 border-l-2 border-champagne pl-6">
                {j.timeline.map((v) => (
                  <li key={v.id} className="relative">
                    <span className="absolute -left-[33px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-coral" aria-hidden />
                    <p className="text-xs font-semibold uppercase tracking-wide text-coral-dark">{fmt(v.date)}</p>
                    <p className="font-medium text-ink">{v.services.join(", ")}</p>
                    <p className="text-sm text-ink/60">
                      {[v.staff, v.branch].filter(Boolean).join(" · ")}
                      {v.reviewed ? (
                        <span className="ml-2 text-xs font-semibold text-green-700">Reviewed ✓</span>
                      ) : (
                        <Link href={`/my-glow?review=${v.id}#services`} className="ml-2 text-xs font-semibold text-coral-dark hover:underline">
                          Rate &amp; Review
                        </Link>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
