"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X, ZoomIn, ZoomOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { receiptSignedUrl } from "@/lib/supabase/queries/payNow";

/** The client's uploaded GCash receipt (private bucket → signed URL).
 * Thumbnail opens a full-screen view with zoom and "open in new tab". */
export default function ReceiptViewer({ path, className = "" }: { path: string | null | undefined; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    if (!path) return;
    receiptSignedUrl(createClient(), path).then((u) => {
      if (cancelled) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) return <p className="text-sm text-ink/40">No receipt uploaded.</p>;
  if (failed) return <p className="text-sm text-red-600">Couldn&apos;t load the receipt. Refresh and try again.</p>;
  if (!url) return <div className={`h-56 animate-pulse rounded-xl bg-blush/60 ${className}`} aria-label="Loading receipt" />;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setZoom(1);
          setOpen(true);
        }}
        className={`group relative block w-full overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.03] ${className}`}
        aria-label="Open receipt larger"
      >
        {/* Signed Supabase URL; a plain img avoids next/image host config for short-lived links. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Client's GCash receipt" className="mx-auto max-h-72 object-contain" />
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
          <ZoomIn className="h-3.5 w-3.5" /> Tap to enlarge
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/90" role="dialog" aria-label="GCash receipt">
          <div className="flex items-center justify-end gap-2 p-3">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <span className="w-12 text-center text-sm text-white">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Open in new tab">
              <ExternalLink className="h-5 w-5" />
            </a>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Client's GCash receipt"
              onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
              style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "min(100%, 640px)" : "none" }}
              className="mx-auto cursor-zoom-in object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
