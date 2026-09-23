"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

type MenuPhoto = { id: string; imageUrl: string };

export default function MenuGalleryModal({ onClose }: { onClose: () => void }) {
  const [photos, setPhotos] = useState<MenuPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/menu-photos")
      .then((res) => res.json())
      .then((data) => {
        setPhotos(data.photos ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Our Menu</h2>
            <button onClick={onClose} className="text-ink/40 hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {loading && (
              <p className="col-span-full py-10 text-center text-sm text-ink/40">
                Loading menu…
              </p>
            )}
            {!loading && photos.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-ink/40">
                Menu photos coming soon.
              </p>
            )}
            {photos.map((p) => (
              <button
                key={p.id}
                onClick={() => setLightboxUrl(p.imageUrl)}
                className="group relative aspect-[3/4] overflow-hidden rounded-xl"
              >
                <Image
                  src={p.imageUrl}
                  alt="Menu"
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, 33vw"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative h-[85vh] w-[85vw] max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxUrl(null)}
              aria-label="Close preview"
              className="absolute -right-3 -top-3 z-10 rounded-full bg-white p-1.5 text-ink shadow-lg hover:bg-blush"
            >
              <X className="h-5 w-5" />
            </button>
            <Image
              src={lightboxUrl}
              alt="Menu full size"
              fill
              className="object-contain"
              sizes="85vw"
            />
          </div>
        </div>
      )}
    </>
  );
}
