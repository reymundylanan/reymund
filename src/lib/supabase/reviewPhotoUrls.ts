import { createAdminClient } from "@/lib/supabase/admin";
import { logQueryError } from "@/lib/supabase/logQueryError";

// Server only: signs private review-photo paths so public pages can show them.
export async function signReviewPhotos(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data, error } = await createAdminClient().storage.from("review-photos").createSignedUrls(paths, 3600);
  if (error) logQueryError("signReviewPhotos", error);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}
