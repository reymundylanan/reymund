import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Check, Clock, Gift } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BookPromoButton from "@/components/promos/BookPromoButton";
import { createClient } from "@/lib/supabase/server";
import { getPromoById } from "@/lib/supabase/queries/promos";
import { getPromoPackage } from "@/lib/supabase/queries/promoPackages";
import { formatMinutes, packageMinutes, promoLengths, regularPrice } from "@/lib/promoPackage";
import { promoImage } from "@/lib/promoImage";

export const dynamic = "force-dynamic";

const LENGTH_LABEL = { short: "Short", medium: "Medium", long: "Long" } as const;

export default async function PromoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [promo, pkg] = await Promise.all([getPromoById(supabase, id), getPromoPackage(supabase, id)]);
  if (!promo || !pkg) notFound();

  const image = promoImage({ title: promo.title, category: promo.category, department: promo.department });
  const servicesHref = promo.category ? `/services?category=${encodeURIComponent(promo.category)}` : "/services";
  const regular = regularPrice(pkg);
  const lengths = promoLengths(pkg);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const expired = !!pkg.validUntil && pkg.validUntil < today;
  const notStarted = !!pkg.validFrom && pkg.validFrom > today;
  const save = regular != null && pkg.price != null && !lengths.length && regular > pkg.price ? regular - pkg.price : null;

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-4 py-10 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <Link href="/#promotions" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to Promotions
          </Link>

          <div className="mt-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-champagne/60">
            <div className="relative h-60 w-full sm:h-72">
              <Image src={image} alt={promo.title} fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
              <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-coral-dark backdrop-blur">
                <Gift className="h-3.5 w-3.5" /> Promo Package
              </span>
              {promo.badge && (
                <span className="absolute right-5 top-5 flex h-16 w-16 items-center justify-center rounded-full bg-coral text-center text-sm font-bold leading-tight text-white shadow">
                  {promo.badge}
                </span>
              )}
            </div>

            <div className="p-6 sm:p-8">
              <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{promo.title}</h1>
              <p className="mt-1 text-sm text-ink/50">{promo.branchName}</p>
              {promo.description && <p className="mt-4 text-ink/70">{promo.description}</p>}

              <div className="mt-6 rounded-2xl border border-champagne bg-cream/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">✨ Included Services</p>
                {pkg.services.length ? (
                  <ul className="mt-3 space-y-2">
                    {pkg.services.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 text-ink">
                          <Check className="h-4 w-4 shrink-0 text-coral-dark" /> {s.name}
                        </span>
                        <span className="shrink-0 text-xs text-ink/50">
                          {s.duration ?? "60 mins"}
                          {s.price > 0 && <> · ₱{s.price.toLocaleString()}</>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-sm text-ink">
                    <Check className="h-4 w-4 text-coral-dark" /> {promo.title}
                  </p>
                )}
                {pkg.services.length > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 border-t border-champagne/70 pt-3 text-sm text-ink/70">
                    <Clock className="h-4 w-4 text-coral-dark" /> Estimated duration: <span className="font-semibold text-ink">{formatMinutes(packageMinutes(pkg))}</span>
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-2">
                {lengths.length ? (
                  <div className="flex flex-wrap gap-2">
                    {lengths.map((l) => (
                      <span key={l.length} className="rounded-full bg-blush px-3 py-1.5 text-sm text-ink">
                        {LENGTH_LABEL[l.length]} · <span className="font-semibold text-coral-dark">₱{l.price.toLocaleString()}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  pkg.price != null && (
                    <div>
                      {regular != null && regular > pkg.price && (
                        <p className="text-sm text-ink/50">
                          Regular Price <span className="line-through">₱{regular.toLocaleString()}.00</span>
                        </p>
                      )}
                      <p className="text-2xl font-semibold text-coral-dark">Promo Price ₱{pkg.price.toLocaleString()}.00</p>
                    </div>
                  )
                )}
                {save != null && (
                  <span className="rounded-full bg-[#e8f5e9] px-3 py-1 text-sm font-semibold text-[#2e7d32]">Save ₱{save.toLocaleString()}</span>
                )}
              </div>
              {promo.validUntil && (
                <p className="mt-2 text-sm text-ink/50">
                  {expired ? "Ended" : "Promo ends"}{" "}
                  {new Date(`${promo.validUntil}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}

              {expired || notStarted ? (
                <p className="mt-6 rounded-xl bg-ink/5 px-4 py-3 text-sm text-ink/60">
                  {expired ? "This promo has ended." : "This promo isn't open for booking yet."}{" "}
                  <Link href={servicesHref} className="font-semibold text-coral-dark hover:underline">
                    See our services
                  </Link>
                </p>
              ) : (
                <BookPromoButton
                  promoId={promo.id}
                  fallbackHref={servicesHref}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-coral px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark disabled:opacity-60"
                />
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
