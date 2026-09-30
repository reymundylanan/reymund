import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewStatus, ReviewTarget } from "@/lib/reviews";
import { reviewPhotoPath } from "@/lib/reviewPhotos";
import { logQueryError } from "@/lib/supabase/logQueryError";

export type BookedService = { position: number; serviceId: string | null; name: string };
export type ServicePart = {
  reviewId: string;
  position: number;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  photos: { path: string; url: string }[];
};
export type OtherPart = { reviewId: string; rating: number; text: string | null; status: ReviewStatus };
export type VisitReview = {
  services: ServicePart[];
  staff?: OtherPart;
  branch?: OtherPart;
  firstSubmittedAt: string;
  editedAt: string | null;
};
export type ServiceDraft = { position: number; rating: number; text: string; keep: string[]; add: Blob[] };
export type VisitReviewDraft = {
  appointmentId: string;
  services: ServiceDraft[];
  staff: { rating: number; text: string } | null;
  branch: { rating: number; text: string } | null;
};

const BUCKET = "review-photos";
export const UPLOAD_FAILED = "Couldn't upload your photos. Please try again.";

/** Signed URLs (1 hour) for the client's own photos, keyed by storage path.
 * Never throws: on failure the map is empty and callers show no photos. */
export async function signReviewPhotos(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) {
    logQueryError("signReviewPhotos", error);
    return urls;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

type PhotoRow = { storage_path: string; position: number };

/** Photo rows in position order. */
export function orderedPhotoPaths(rows: PhotoRow[] | null | undefined): string[] {
  return [...(rows ?? [])].sort((a, b) => a.position - b.position).map((p) => p.storage_path);
}

type ReviewRow = {
  id: string;
  appointment_id: string;
  target_type: ReviewTarget;
  service_position: number | null;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  first_submitted_at: string | null;
  edited_at: string | null;
  review_photos: PhotoRow[] | null;
};

/** This client's reviews grouped by appointment — every status, so the
 * client can see "Hidden by the spa" on parts an admin hid. */
export async function getVisitReviews(
  supabase: SupabaseClient,
  clientId: string
): Promise<Record<string, VisitReview>> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, appointment_id, target_type, service_position, rating, text, status, first_submitted_at, edited_at, review_photos(storage_path, position)"
    )
    .eq("client_id", clientId)
    .not("appointment_id", "is", null);
  if (error) {
    logQueryError("getVisitReviews", error);
    return {};
  }
  const rows = (data ?? []) as unknown as ReviewRow[];
  const urls = await signReviewPhotos(
    supabase,
    rows.flatMap((r) => orderedPhotoPaths(r.review_photos))
  );

  const map: Record<string, VisitReview> = {};
  for (const row of rows) {
    const visit = (map[row.appointment_id] ??= {
      services: [],
      firstSubmittedAt: row.first_submitted_at ?? "",
      editedAt: null,
    });
    if (row.first_submitted_at && (!visit.firstSubmittedAt || row.first_submitted_at < visit.firstSubmittedAt)) {
      visit.firstSubmittedAt = row.first_submitted_at;
    }
    if (row.edited_at && (!visit.editedAt || row.edited_at > visit.editedAt)) visit.editedAt = row.edited_at;

    if (row.target_type === "service") {
      visit.services.push({
        reviewId: row.id,
        position: row.service_position ?? 0,
        rating: row.rating,
        text: row.text,
        status: row.status,
        photos: orderedPhotoPaths(row.review_photos).flatMap((path) => {
          const url = urls.get(path);
          return url ? [{ path, url }] : [];
        }),
      });
    } else {
      visit[row.target_type] = { reviewId: row.id, rating: row.rating, text: row.text, status: row.status };
    }
  }
  for (const visit of Object.values(map)) visit.services.sort((a, b) => a.position - b.position);
  return map;
}

/** Uploads new photos, then calls the submit/edit RPC. `code` is the bare
 * REVIEW_… error from the database (map it with reviewErrorMessage). */
export async function saveVisitReview(
  supabase: SupabaseClient,
  uid: string,
  draft: VisitReviewDraft,
  mode: "submit" | "edit",
  onProgress?: (done: number, total: number) => void
): Promise<{ error: string | null; code: string | null }> {
  const bucket = supabase.storage.from(BUCKET);
  const total = draft.services.reduce((n, s) => n + s.add.length, 0);
  const uploaded: string[] = [];
  const photosByPart: string[][] = [];

  for (const part of draft.services) {
    const paths = [...part.keep];
    for (const blob of part.add) {
      const path = reviewPhotoPath(uid, draft.appointmentId, crypto.randomUUID());
      const { error } = await bucket.upload(path, blob, { contentType: "image/jpeg" });
      if (error) {
        logQueryError("saveVisitReview upload", error);
        if (uploaded.length) await bucket.remove(uploaded);
        return { error: UPLOAD_FAILED, code: null };
      }
      uploaded.push(path);
      paths.push(path);
      onProgress?.(uploaded.length, total);
    }
    photosByPart.push(paths);
  }

  const { data, error } = await supabase.rpc(mode === "submit" ? "submit_visit_review" : "edit_visit_review", {
    p_appointment_id: draft.appointmentId,
    p_services: draft.services.map((s, i) => ({
      position: s.position,
      rating: s.rating,
      text: s.text,
      photos: photosByPart[i],
    })),
    p_staff_rating: draft.staff?.rating ?? null,
    p_staff_text: draft.staff?.text ?? null,
    p_branch_rating: draft.branch?.rating ?? null,
    p_branch_text: draft.branch?.text ?? null,
  });
  if (error) {
    if (uploaded.length) await bucket.remove(uploaded);
    return { error: null, code: error.message?.trim() ?? "" };
  }
  const unused = (mode === "edit" ? (data as string[] | null) : null) ?? [];
  if (unused.length) await bucket.remove(unused);
  return { error: null, code: null };
}
