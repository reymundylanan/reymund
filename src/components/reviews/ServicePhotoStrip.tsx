"use client";

import { useState } from "react";
import Image from "next/image";
import PhotoLightbox from "@/components/reviews/PhotoLightbox";

export default function ServicePhotoStrip({ photos }: { photos: { url: string; reviewId: string }[] }) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <button
            key={p.url}
            onClick={() => setIndex(i)}
            aria-label={`Open client photo ${i + 1}`}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-blush"
          >
            <Image src={p.url} alt="" fill sizes="96px" unoptimized className="object-cover" />
          </button>
        ))}
      </div>
      {index !== null && <PhotoLightbox photos={photos} startIndex={index} onClose={() => setIndex(null)} showViewReview />}
    </>
  );
}
