import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";

// Photos and videos of each service (074), uploaded by Admin in Branches &
// Services and shown to clients on the Services page and service details.

export const SERVICE_MEDIA_BUCKET = "service-media";
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export type ServiceMediaItem = {
  id: string;
  kind: "image" | "video" | "youtube";
  /** The file's public URL, or the YouTube video's thumbnail. */
  url: string;
  youtubeId: string | null;
  storagePath: string | null;
  caption: string | null;
  position: number;
};

type Row = {
  id: string;
  service_id: string;
  kind: ServiceMediaItem["kind"];
  storage_path: string | null;
  youtube_id: string | null;
  caption: string | null;
  position: number;
};

/** The 11-character video id from any YouTube link (watch, youtu.be, shorts, embed), or null. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export const youTubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youTubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;

/** "image" / "video" for an allowed file, otherwise null. */
export function mediaKindForType(type: string): "image" | "video" | null {
  if (IMAGE_TYPES.includes(type)) return "image";
  if (VIDEO_TYPES.includes(type)) return "video";
  return null;
}

function toItem(supabase: SupabaseClient, r: Row): ServiceMediaItem {
  const url =
    r.kind === "youtube"
      ? youTubeThumb(r.youtube_id ?? "")
      : supabase.storage.from(SERVICE_MEDIA_BUCKET).getPublicUrl(r.storage_path ?? "").data.publicUrl;
  return { id: r.id, kind: r.kind, url, youtubeId: r.youtube_id, storagePath: r.storage_path, caption: r.caption, position: r.position };
}

/** One service's media, in order (for the admin editor). */
export async function getMediaForService(supabase: SupabaseClient, serviceId: string): Promise<ServiceMediaItem[]> {
  const { data, error } = await supabase
    .from("service_media")
    .select("id, service_id, kind, storage_path, youtube_id, caption, position")
    .eq("service_id", serviceId)
    .order("position")
    .order("created_at");
  if (error && !isNotMigratedError(error)) logQueryError("getMediaForService", error);
  return ((data ?? []) as Row[]).map((r) => toItem(supabase, r));
}

/** Media for many services at once, keyed by the given service ids. Media added
 * to the same service name at any branch is shared, like reviews. */
export async function getServiceMediaMap(
  supabase: SupabaseClient,
  services: { id: string; name: string }[]
): Promise<Record<string, ServiceMediaItem[]>> {
  if (services.length === 0) return {};
  const names = [...new Set(services.map((s) => s.name))];
  const { data: same, error: sameError } = await supabase.from("branch_services").select("id, name").in("name", names);
  if (sameError) logQueryError("getServiceMediaMap services", sameError);
  const nameById = new Map<string, string>(((same ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  for (const s of services) nameById.set(s.id, s.name);

  const { data, error } = await supabase
    .from("service_media")
    .select("id, service_id, kind, storage_path, youtube_id, caption, position")
    .in("service_id", [...nameById.keys()])
    .order("position")
    .order("created_at");
  if (error) {
    // Before migration 074 is applied there's simply no media yet.
    if (!isNotMigratedError(error)) logQueryError("getServiceMediaMap", error);
    return {};
  }

  const byName = new Map<string, ServiceMediaItem[]>();
  for (const r of (data ?? []) as Row[]) {
    const name = nameById.get(r.service_id);
    if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), toItem(supabase, r)]);
  }
  const out: Record<string, ServiceMediaItem[]> = {};
  for (const s of services) {
    const list = byName.get(s.name);
    if (list?.length) out[s.id] = list;
  }
  return out;
}
