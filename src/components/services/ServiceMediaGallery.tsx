"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import MediaLightbox from "@/components/services/MediaLightbox";
import type { ServiceMediaItem } from "@/lib/serviceMedia";

/** Service details: the spa's own photos and videos of this treatment. */
export default function ServiceMediaGallery({ items, title }: { items: ServiceMediaItem[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;
  return (
    <section className="rounded-3xl bg-white p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Photos &amp; videos</h2>
      <p className="mt-1 text-sm text-ink/50">See {title} at Blush Spa &amp; Aesthetics.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`Open ${m.kind === "image" ? "photo" : "video"} ${i + 1}${m.caption ? `: ${m.caption}` : ""}`}
            className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-blush"
          >
            {m.kind === "video" ? (
              <video src={`${m.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            ) : (
              <Image src={m.url} alt={m.caption ?? ""} fill unoptimized className="object-cover transition-transform duration-500 group-hover:scale-105" />
            )}
            {m.kind !== "image" && (
              <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-coral-dark shadow-lg">
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </span>
            )}
            {m.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-left text-xs font-medium text-white">
                {m.caption}
              </span>
            )}
          </button>
        ))}
      </div>
      {open !== null && <MediaLightbox items={items} startIndex={open} title={title} onClose={() => setOpen(null)} />}
    </section>
  );
}
