import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Clock, Star, Tag } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServiceBookButton from "@/components/services/ServiceBookButton";
import ServiceReviewsSection from "@/components/reviews/ServiceReviewsSection";
import ServicePhotoStrip from "@/components/reviews/ServicePhotoStrip";
import ServiceMediaGallery from "@/components/services/ServiceMediaGallery";
import { getServiceMediaMap } from "@/lib/serviceMedia";
import { createClient } from "@/lib/supabase/server";
import { getServiceImage } from "@/lib/serviceImage";
import { signPublicReviewPhotos } from "@/lib/supabase/reviewPhotoUrls";
import {
  getPublicService,
  getServicePhotoStrip,
  getServiceRatingSummary,
  getServiceReviewPage,
  getUnreviewedVisitForService,
} from "@/lib/supabase/queries/serviceReviews";

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

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const service = await getPublicService(supabase, id);
  if (!service) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [summary, firstPage, photos, unreviewedVisit, mediaMap] = await Promise.all([
    getServiceRatingSummary(supabase, id),
    getServiceReviewPage(supabase, signPublicReviewPhotos, id, "all", 0),
    getServicePhotoStrip(supabase, signPublicReviewPhotos, id),
    user ? getUnreviewedVisitForService(supabase, user.id, id) : Promise.resolve(null),
    getServiceMediaMap(supabase, [{ id, name: service.name }]),
  ]);

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-12">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link href="/services" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to Services
          </Link>

          <div className="overflow-hidden rounded-3xl bg-white shadow-sm md:flex">
            <div className="relative h-56 md:h-auto md:w-2/5">
              <Image src={getServiceImage(service.name)} alt={service.name} fill sizes="(max-width: 768px) 100vw, 40vw" className="object-cover" />
            </div>
            <div className="flex flex-1 flex-col gap-3 p-8">
              <h1 className="text-2xl font-semibold text-ink">{service.name}</h1>
              <div className="flex items-center gap-2">
                {summary.count > 0 && <StarRow value={summary.average} />}
                <span className="text-sm text-ink/60">
                  {summary.count > 0
                    ? `${summary.average} (${summary.count} Review${summary.count === 1 ? "" : "s"})`
                    : "No reviews yet"}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-ink/60">
                {service.duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {service.duration}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Tag className="h-4 w-4" />
                  {service.category}
                </span>
              </div>
              {(service.description || service.benefits) && (
                <p className="text-sm text-ink/70">{service.description || service.benefits}</p>
              )}
              <div className="mt-auto flex items-center justify-between border-t border-ink/10 pt-4">
                <span className="text-2xl font-bold text-gold">₱{(service.price ?? 0).toLocaleString()}</span>
                <ServiceBookButton service={{ name: service.name, duration: service.duration ?? "", price: service.price ?? 0, category: service.category }} />
              </div>
            </div>
          </div>

          <ServiceMediaGallery items={mediaMap[id] ?? []} title={service.name} />

          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Customer Reviews</h2>
            {summary.count === 0 ? (
              <p className="mt-3 text-sm text-ink/50">No reviews yet.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="text-center sm:w-40">
                  <p className="text-5xl font-bold text-ink">{summary.average}</p>
                  <div className="mt-2 flex justify-center">
                    <StarRow value={summary.average} />
                  </div>
                  <p className="mt-1 text-sm text-ink/50">Based on {summary.count} review{summary.count === 1 ? "" : "s"}</p>
                </div>
                <div className="flex-1 space-y-1">
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

            {unreviewedVisit && (
              <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-blush/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-ink">You&apos;ve booked this service before</p>
                  <p className="text-sm text-ink/60">Share your experience to help other clients.</p>
                </div>
                <Link
                  href={`/my-glow?review=${unreviewedVisit}`}
                  className="rounded-full bg-coral px-5 py-2 text-center text-sm font-semibold text-white hover:bg-coral-dark"
                >
                  Write a Review
                </Link>
              </div>
            )}

            {photos.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-ink">Photos from Clients</h3>
                <ServicePhotoStrip photos={photos} />
              </div>
            )}

            <div id="reviews" className="mt-8 scroll-mt-28">
              <ServiceReviewsSection serviceId={id} initial={firstPage} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
