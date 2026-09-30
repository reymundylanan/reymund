import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicStatus, reviewerName, type ReviewStatus } from "@/lib/reviews";
import { logQueryError } from "@/lib/supabase/logQueryError";

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  return !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;
}

export type RawStaffReviewRow = {
  id: string;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  created_at: string;
  edited_at?: string | null;
  client: Rel<{ full_name: string | null }>;
  service: Rel<{ name: string }>;
  appointment: Rel<{ scheduled_date: string | null; booked?: { service_name: string; position: number }[] | null }>;
};

export type StaffReviewItem = {
  id: string;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  createdAt: string;
  editedAt: string | null;
  reviewer: string;
  serviceName: string | null;
  serviceDate: string | null;
};

/** Staff reviews for the Admin / Front Desk staff panels. Front Desk sees
 * only what the public sees (visible + flagged); Admin also sees hidden
 * and removed ones. */
export function toStaffReviewItems(rows: RawStaffReviewRow[], includeHidden: boolean): StaffReviewItem[] {
  return rows
    .filter((r) => includeHidden || isPublicStatus(r.status))
    .map((r) => {
      const appt = one(r.appointment);
      const booked = [...(appt?.booked ?? [])].sort((a, b) => a.position - b.position).map((b) => b.service_name);
      return {
        id: r.id,
        rating: r.rating,
        text: r.text,
        status: r.status,
        createdAt: r.created_at,
        editedAt: r.edited_at ?? null,
        reviewer: reviewerName(one(r.client)?.full_name ?? null),
        serviceName: booked.length ? booked.join(", ") : (one(r.service)?.name ?? null),
        serviceDate: appt?.scheduled_date ?? null,
      };
    });
}

const SELECT =
  "id, rating, text, status, created_at, edited_at, client:profiles!reviews_client_id_fkey(full_name), service:branch_services(name), appointment:appointments(scheduled_date, booked:appointment_services(service_name, position))";
// Before 051: no edited_at column and no appointment_services table.
const SELECT_PRE_051 =
  "id, rating, text, status, created_at, client:profiles!reviews_client_id_fkey(full_name), service:branch_services(name), appointment:appointments(scheduled_date)";

export async function getStaffReviews(
  supabase: SupabaseClient,
  staffId: string,
  includeHidden: boolean
): Promise<StaffReviewItem[]> {
  const query = (select: string) =>
    supabase
      .from("reviews")
      .select(select)
      .eq("target_type", "staff")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false });

  let { data, error } = await query(SELECT);
  if (error) {
    logQueryError("getStaffReviews", error);
    ({ data, error } = await query(SELECT_PRE_051));
    if (error) {
      logQueryError("getStaffReviews fallback", error);
      return [];
    }
  }
  return toStaffReviewItems((data as unknown as RawStaffReviewRow[]) ?? [], includeHidden);
}
