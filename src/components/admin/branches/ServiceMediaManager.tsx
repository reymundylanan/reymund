"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, MonitorPlay, Play, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  IMAGE_TYPES,
  MAX_MEDIA_BYTES,
  SERVICE_MEDIA_BUCKET,
  VIDEO_TYPES,
  getMediaForService,
  mediaKindForType,
  parseYouTubeId,
  type ServiceMediaItem,
} from "@/lib/serviceMedia";

/** Admin → Branches & Services → Edit service: photos and videos clients see
 * on the Services page. Upload files (up to 50 MB) or add a YouTube link. */
export default function ServiceMediaManager({ serviceId, serviceName }: { serviceId: string; serviceName: string }) {
  const [items, setItems] = useState<ServiceMediaItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setItems(await getMediaForService(createClient(), serviceId));
  }, [serviceId]);

  useEffect(() => {
    let cancelled = false;
    getMediaForService(createClient(), serviceId).then((list) => !cancelled && setItems(list));
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  const nextPosition = () => (items && items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    let position = nextPosition();
    for (const file of Array.from(files)) {
      const kind = mediaKindForType(file.type);
      if (!kind) {
        setError(`${file.name}: use a JPG, PNG or WebP photo, or an MP4, WebM or MOV video.`);
        continue;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        setError(`${file.name} is over 50 MB. Shorten it, or upload it to YouTube and add the link instead.`);
        continue;
      }
      setBusy(`Uploading ${file.name}…`);
      const ext = (file.name.split(".").pop() ?? (kind === "image" ? "jpg" : "mp4")).toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${serviceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(SERVICE_MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setError(`Couldn't upload ${file.name}: ${upErr.message}`);
        continue;
      }
      const { error: rowErr } = await supabase
        .from("service_media")
        .insert({ service_id: serviceId, kind, storage_path: path, position: position++, created_by: auth.user?.id ?? null });
      if (rowErr) {
        await supabase.storage.from(SERVICE_MEDIA_BUCKET).remove([path]);
        setError(`Couldn't save ${file.name}: ${rowErr.message}`);
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  }

  async function addYouTube() {
    const id = parseYouTubeId(link);
    if (!id) {
      setError("That doesn't look like a YouTube link. Paste the link from the video's Share button.");
      return;
    }
    setError(null);
    setBusy("Adding video…");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error: rowErr } = await supabase
      .from("service_media")
      .insert({ service_id: serviceId, kind: "youtube", youtube_id: id, position: nextPosition(), created_by: auth.user?.id ?? null });
    setBusy(null);
    if (rowErr) setError(`Couldn't add the video: ${rowErr.message}`);
    else setLink("");
    await load();
  }

  async function remove(item: ServiceMediaItem) {
    setBusy("Removing…");
    const supabase = createClient();
    const { error: rowErr } = await supabase.from("service_media").delete().eq("id", item.id);
    if (!rowErr && item.storagePath) await supabase.storage.from(SERVICE_MEDIA_BUCKET).remove([item.storagePath]);
    setBusy(null);
    if (rowErr) setError(`Couldn't remove it: ${rowErr.message}`);
    await load();
  }

  async function move(index: number, step: -1 | 1) {
    if (!items) return;
    const other = items[index + step];
    const item = items[index];
    if (!other) return;
    setBusy("Reordering…");
    const supabase = createClient();
    await Promise.all([
      supabase.from("service_media").update({ position: other.position }).eq("id", item.id),
      supabase.from("service_media").update({ position: item.position }).eq("id", other.id),
    ]);
    setBusy(null);
    await load();
  }

  async function saveCaption(item: ServiceMediaItem, caption: string) {
    const next = caption.trim().slice(0, 140) || null;
    if (next === item.caption) return;
    const { error: capErr } = await createClient().from("service_media").update({ caption: next }).eq("id", item.id);
    if (capErr) setError(`Couldn't save the caption: ${capErr.message}`);
    else await load();
  }

  return (
    <div className="space-y-3 rounded-xl border border-ink/10 bg-cream/40 p-3">
      <div>
        <p className="text-sm font-medium text-ink/70">
          Photos &amp; videos <span className="text-ink/30">(Optional)</span>
        </p>
        <p className="text-xs text-ink/45">
          Clients see these on the Services page for {serviceName}. The first one is the card&apos;s picture.
        </p>
      </div>

      {items === null ? (
        <div className="h-20 animate-pulse rounded-lg bg-ink/5" />
      ) : items.length === 0 ? (
        <p className="text-xs text-ink/45">No photos or videos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item, i) => (
            <div key={item.id} className="overflow-hidden rounded-lg border border-ink/10 bg-white">
              <div className="relative aspect-video bg-ink/5">
                {item.kind === "video" ? (
                  <video src={`${item.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <Image src={item.url} alt="" fill unoptimized className="object-cover" />
                )}
                {item.kind !== "image" && (
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {item.kind === "youtube" ? <MonitorPlay className="h-3 w-3" /> : <Play className="h-3 w-3" />} {item.kind === "youtube" ? "YouTube" : "Video"}
                  </span>
                )}
                {i === 0 && <span className="absolute right-1.5 top-1.5 rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>}
              </div>
              <div className="space-y-1 p-1.5">
                <input
                  defaultValue={item.caption ?? ""}
                  onBlur={(e) => saveCaption(item, e.target.value)}
                  placeholder="Caption (optional)"
                  maxLength={140}
                  aria-label="Caption"
                  className="w-full rounded border border-ink/10 px-1.5 py-1 text-xs outline-none focus:border-coral"
                />
                <div className="flex items-center justify-between">
                  <span className="flex">
                    <button type="button" onClick={() => move(i, -1)} disabled={!!busy || i === 0} aria-label="Move earlier" className="rounded p-1 text-ink/50 hover:bg-ink/5 disabled:opacity-30">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={!!busy || i === items.length - 1} aria-label="Move later" className="rounded p-1 text-ink/50 hover:bg-ink/5 disabled:opacity-30">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <button type="button" onClick={() => remove(item)} disabled={!!busy} aria-label="Remove" className="rounded p-1 text-red-500/80 hover:bg-red-50 disabled:opacity-30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
          onChange={(e) => upload(e.target.files)}
          className="hidden"
          id={`service-media-${serviceId}`}
        />
        <label
          htmlFor={`service-media-${serviceId}`}
          className={`flex cursor-pointer items-center gap-1.5 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark ${busy ? "pointer-events-none opacity-50" : ""}`}
        >
          <ImagePlus className="h-3.5 w-3.5" /> Upload photos / videos
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="or paste a YouTube link"
            aria-label="YouTube link"
            className="min-w-0 flex-1 rounded-full border border-ink/15 px-3 py-1.5 text-xs outline-none focus:border-coral"
          />
          <button
            type="button"
            onClick={addYouTube}
            disabled={!!busy || !link.trim()}
            className="shrink-0 rounded-full border border-coral px-3 py-1.5 text-xs font-semibold text-coral-dark hover:bg-blush disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {busy && (
        <p className="flex items-center gap-1.5 text-xs text-ink/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-ink/40">Photos: JPG, PNG or WebP. Videos: MP4, WebM or MOV up to 50 MB — longer videos work best as a YouTube link.</p>
    </div>
  );
}
