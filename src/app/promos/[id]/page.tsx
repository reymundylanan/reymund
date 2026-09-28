import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { getPromoById } from "@/lib/supabase/queries/promos";
import { getServiceImage } from "@/lib/serviceImage";

export const dynamic = "force-dynamic";

export default async function PromoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const promo = await getPromoById(supabase, id);
  if (!promo) notFound();

  const image = getServiceImage(promo.category ?? promo.department ?? promo.title);
  const bookHref = promo.category ? `/services?category=${encodeURIComponent(promo.category)}` : "/services";

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <Link href="/services" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to Services
          </Link>

          <div className="mt-4 overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="relative h-72 w-full">
              <Image src={image} alt={promo.title} fill className="object-cover" />
              {promo.badge && (
                <span className="absolute right-6 top-6 flex h-16 w-16 items-center justify-center rounded-full bg-coral text-center text-sm font-bold leading-tight text-white shadow">
                  {promo.badge}
                </span>
              )}
            </div>

            <div className="p-8">
              <h1 className="text-3xl font-semibold text-ink">{promo.title}</h1>
              <p className="mt-1 text-sm text-ink/50">{promo.branchName}</p>
              {promo.description && <p className="mt-4 text-ink/70">{promo.description}</p>}

              <div className="mt-6 flex flex-wrap items-center gap-4">
                {promo.price != null && (
                  <p className="text-2xl font-semibold text-coral-dark">₱{promo.price.toLocaleString()}.00</p>
                )}
                {promo.validUntil && (
                  <p className="text-sm text-ink/50">
                    Valid until{" "}
                    {new Date(promo.validUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>

              <Link
                href={bookHref}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-coral px-8 py-3 text-sm font-semibold text-white hover:bg-coral-dark"
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
