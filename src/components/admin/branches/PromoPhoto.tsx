"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isNotMigratedError } from "@/lib/supabase/logQueryError";
import { IMAGE_TYPES, SERVICE_MEDIA_BUCKET } from "@/lib/serviceMedia";
import { PROMO_PHOTO_FOLDER, promoImage } from "@/lib/promoImage";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * A promo's photo in the Admin list: click to upload or change it. It's saved
 * on every promotion with the same name (in any branch), so the same deal
 * shows the same picture everywhere. Without one, the category picture shows.
 */
export default function PromoPhoto({
  titles,
  imagePath,
  category,
  size = "h-12 w-12",
  onChanged,
}: {
  /** Promo names that share this photo (e.g. both MesoLipo options). */
  titles: string[];
  imagePath: string | null | undefined;
  category: string | null;
  size?: string;
  onChanged: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = promoImage({ title: titles[0] ?? "", category, imagePath });

  async function save(path: string | null) {
    const supabase = createClient();
    const { error: e } = await supabase.from("branch_promotions").update({ image_path: path }).in("title", titles);
    if (e) throw new Error(isNotMigratedError(e) ? "Promo photos need database migration 080 — apply it in Supabase first." : e.message);
    // The old file is no longer used by any promo with these names.
    if (imagePath && imagePath !== path) await supabase.storage.from(SERVICE_MEDIA_BUCKET).remove([imagePath]);
  }

  async function upload(file: File) {
    setError(null);
    if (!IMAGE_TYPES.includes(file.type)) return setError("Use a JPG, PNG or WebP photo.");
    if (file.size > MAX_BYTES) return setError("Photo is too big — 5 MB at most.");
    setBusy(true);
    const supabase = createClient();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${PROMO_PHOTO_FOLDER}/${crypto.randomUUID()}.${ext}`;
    try {
      const { error: up } = await supabase.storage.from(SERVICE_MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up) throw new Error(up.message);
      try {
        await save(path);
      } catch (e) {
        await supabase.storage.from(SERVICE_MEDIA_BUCKET).remove([path]);
        throw e;
      }
      onChanged(`Photo saved for ${titles[0]}.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await save(null);
      onChanged(`Photo removed from ${titles[0]} — the category picture shows instead.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="shrink-0">
      <div className="group relative">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          title={imagePath ? "Change photo" : "Add a photo for this promo"}
          aria-label={imagePath ? `Change photo of ${titles[0]}` : `Add a photo for ${titles[0]}`}
          className={`relative block overflow-hidden rounded-lg ring-1 ring-ink/10 ${size}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className={`h-full w-full object-cover ${imagePath ? "" : "opacity-60 grayscale-[40%]"}`} />
          <span className={`absolute inset-0 grid place-items-center bg-ink/40 text-white transition ${busy ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${imagePath ? "" : "!opacity-100 bg-ink/25"}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </span>
        </button>
        {imagePath && !busy && (
          <button
            type="button"
            onClick={remove}
            title="Remove photo"
            aria-label={`Remove photo of ${titles[0]}`}
            className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-white p-0.5 text-red-500 shadow ring-1 ring-ink/10 group-hover:block"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </div>
      {error && <p className="mt-1 max-w-[12rem] text-[11px] leading-tight text-red-600">{error}</p>}
    </div>
  );
}
