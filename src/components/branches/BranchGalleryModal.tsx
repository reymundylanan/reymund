"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export default function BranchGalleryModal({ photos }: { photos: string[] }) {
  const [gridOpen, setGridOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length <= 3) return null;

  function openLightbox(i: number) {
    setLightboxIndex(i);
  }

  function closeLightbox() {
    setLightboxIndex(null);
  }

  function prev() {
    setLightboxIndex((i) => (i === null ? 0 : (i - 1 + photos.length) % photos.length));
  }

  function next() {
    setLightboxIndex((i) => (i === null ? 0 : (i + 1) % photos.length));
  }

  return (
    <>
      <button
        onClick={() => setGridOpen(true)}
        className="absolute bottom-4 right-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-blush transition-colors"
      >
        See all images
      </button>

      {/* Grid overlay */}
      {gridOpen && lightboxIndex === null && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/90">
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm font-semibold text-white">{photos.length} Photos</span>
            <button
              onClick={() => setGridOpen(false)}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((url, i) => (
                <button
                  key={i}
                  onClick={() => openLightbox(i)}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-white/5 focus:outline-none"
                >
                  <Image
                    src={url}
                    alt={`Gallery photo ${i + 1}`}
                    fill
                    className="object-cover transition-transform duration-200 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95">
          <button
            onClick={closeLightbox}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>

          <button
            onClick={prev}
            className="absolute left-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div className="relative h-[80vh] w-[80vw] max-w-4xl overflow-hidden rounded-2xl">
            <Image
              src={photos[lightboxIndex]}
              alt={`Photo ${lightboxIndex + 1}`}
              fill
              className="object-contain"
              sizes="80vw"
            />
          </div>

          <button
            onClick={next}
            className="absolute right-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <span className="absolute bottom-6 text-sm text-white/60">
            {lightboxIndex + 1} / {photos.length}
          </span>
        </div>
      )}
    </>
  );
}
