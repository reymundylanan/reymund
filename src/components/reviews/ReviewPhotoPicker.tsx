"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Plus, X } from "lucide-react";
import { MAX_REVIEW_PHOTOS } from "@/lib/reviewPhotos";

type Existing = { path: string; url: string };
type Added = { blob: Blob; preview: string };

/** A thumbnail that disappears if its file can't be loaded (e.g. deleted). */
function Thumb({ src, onRemove, onClick }: { src: string; onRemove?: () => void; onClick?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed && !onRemove) return null;
  return (
    <div className="relative h-16 w-16 shrink-0">
      {failed ? (
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-ink/5 text-[10px] text-ink/40">
          Missing
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={!onClick}
          aria-label="View photo"
          className="block h-16 w-16 overflow-hidden rounded-xl"
        >
          <Image
            src={src}
            alt="Review photo"
            width={64}
            height={64}
            unoptimized
            onError={() => setFailed(true)}
            className="h-16 w-16 rounded-xl object-cover"
          />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove photo"
          className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-white hover:bg-ink/80"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default function ReviewPhotoPicker({
  existing,
  added,
  onRemoveExisting,
  onAdd,
  onRemoveAdded,
  onView,
  error,
  disabled,
  adding = false,
}: {
  existing: Existing[];
  added: Added[];
  onRemoveExisting: (path: string) => void;
  onAdd: (files: File[]) => void;
  onRemoveAdded: (index: number) => void;
  /** View mode: clicking an existing photo (read-only when `disabled`). */
  onView?: (index: number) => void;
  error: string | null;
  disabled: boolean;
  /** Photos are still being resized: hold the Add tile. */
  adding?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const full = existing.length + added.length >= MAX_REVIEW_PHOTOS;

  if (disabled && existing.length === 0 && added.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {existing.map((p, i) => (
          <Thumb
            key={p.path}
            src={p.url}
            onClick={onView ? () => onView(i) : undefined}
            onRemove={disabled ? undefined : () => onRemoveExisting(p.path)}
          />
        ))}
        {added.map((p, i) => (
          <Thumb key={p.preview} src={p.preview} onRemove={disabled ? undefined : () => onRemoveAdded(i)} />
        ))}
        {!disabled && !full && !adding && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-ink/30 text-[10px] font-medium text-ink/50 hover:border-coral hover:text-coral-dark"
          >
            <Plus className="h-4 w-4" />
            Add Photos
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          onAdd(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {!disabled && (
        <p className="mt-1 text-[11px] text-ink/40">
          Up to {MAX_REVIEW_PHOTOS} photos · {existing.length + added.length}/{MAX_REVIEW_PHOTOS}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
