import Image from "next/image";
import { Star } from "lucide-react";
import BranchGalleryModal from "@/components/branches/BranchGalleryModal";

export default function BranchGallery({
  name = "Blush Spa Aesthetics - Pagadian",
  hours,
  photos = [],
}: {
  name?: string;
  hours?: string;
  photos?: string[];
}) {
  const [main, second, third] = photos;

  return (
    <section className="mx-auto max-w-7xl px-6 pt-10">
      <h1 className="text-3xl font-semibold text-ink">{name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink/60">
        <span className="inline-flex items-center gap-1 font-semibold text-ink">
          5.0
          <span className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-gold text-gold" />
            ))}
          </span>
          (3)
        </span>
        {hours && <span>&bull; Open {hours}</span>}
      </div>

      <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        {/* Main large photo */}
        <div className="relative h-72 overflow-hidden rounded-2xl bg-gradient-to-br from-rose to-coral">
          {main && (
            <Image src={main} alt="Branch gallery" fill className="object-cover" sizes="(max-width: 640px) 100vw, 66vw" />
          )}
        </div>

        {/* Two small photos */}
        <div className="grid gap-3">
          <div className="relative h-[8.5rem] overflow-hidden rounded-2xl bg-gradient-to-br from-coral to-ink/40">
            {second && (
              <Image src={second} alt="Branch gallery" fill className="object-cover" sizes="33vw" />
            )}
          </div>
          <div className="relative h-[8.5rem] overflow-hidden rounded-2xl bg-gradient-to-br from-ink/30 to-coral-dark">
            {third && (
              <Image src={third} alt="Branch gallery" fill className="object-cover" sizes="33vw" />
            )}
          </div>
        </div>

        <BranchGalleryModal photos={photos} />
      </div>
    </section>
  );
}
