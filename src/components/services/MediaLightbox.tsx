"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { youTubeEmbed, type ServiceMediaItem } from "@/lib/serviceMedia";

/** Full-screen viewer for a service's photos and videos (uploaded or YouTube). */
export default function MediaLightbox({
  items,
  startIndex = 0,
  title,
  onClose,
}: {
  items: ServiceMediaItem[];
  startIndex?: number;
  title?: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const count = items.length;
  const item = items[Math.min(index, count - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [count, onClose]);

  if (!item) return null;

  return (
    <div role="dialog" aria-label={title ? `${title} photos and videos` : "Photos and videos"} className="fixed inset-0 z-[90] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 truncate text-sm font-semibold">
          {title}
          {count > 1 && <span className="ml-2 font-normal text-white/60">{index + 1} / {count}</span>}
        </p>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {item.kind === "image" && (
          <div className="relative h-full w-full max-w-4xl">
            <Image src={item.url} alt={item.caption ?? ""} fill unoptimized className="object-contain" />
          </div>
        )}
        {item.kind === "video" && (
          <video key={item.id} src={item.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl bg-black" />
        )}
        {item.kind === "youtube" && item.youtubeId && (
          <iframe
            key={item.id}
            src={youTubeEmbed(item.youtubeId)}
            title={item.caption ?? "Service video"}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="aspect-video w-full max-w-4xl rounded-xl bg-black"
          />
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              aria-label="Previous"
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % count)}
              aria-label="Next"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {item.caption && (
        <p className="px-4 pb-5 text-center text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
          {item.caption}
        </p>
      )}
    </div>
  );
}
