"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type LightboxPhoto = { url: string; reviewId?: string };

export default function PhotoLightbox({
  photos,
  startIndex = 0,
  onClose,
  showViewReview = false,
}: {
  photos: LightboxPhoto[];
  startIndex?: number;
  onClose: () => void;
  showViewReview?: boolean;
}) {
  const [index, setIndex] = useState(startIndex);
  const count = photos.length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClose]);

  if (count === 0) return null;
  const photo = photos[Math.min(index, count - 1)];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <X className="h-6 w-6" />
      </button>
      <div className="absolute left-1/2 top-5 -translate-x-1/2 text-sm text-white/80">
        {index + 1} / {count}
      </div>
      {count > 1 && (
        <button
          onClick={() => setIndex((i) => (i - 1 + count) % count)}
          aria-label="Previous photo"
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <div className="relative h-[80vh] w-[85vw] max-w-5xl">
        <Image src={photo.url} alt={`Client photo ${index + 1}`} fill sizes="85vw" unoptimized className="object-contain" />
      </div>
      {count > 1 && (
        <button
          onClick={() => setIndex((i) => (i + 1) % count)}
          aria-label="Next photo"
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      {showViewReview && photo.reviewId && (
        <button
          onClick={() => {
            const id = photo.reviewId;
            onClose();
            setTimeout(() => document.getElementById(`review-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
          }}
          className="absolute bottom-6 rounded-full bg-white px-5 py-2 text-sm font-semibold text-ink hover:bg-blush"
        >
          View review
        </button>
      )}
    </div>
  );
}
