import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logQueryError } from "@/lib/supabase/logQueryError";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: requesterProfile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();

  if (requesterProfile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { reviewId?: unknown } | null;
  const reviewId = typeof body?.reviewId === "string" ? body.reviewId : "";
  if (!reviewId) {
    return NextResponse.json({ error: "Missing reviewId." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: review, error: reviewError } = await admin.from("reviews").select("status").eq("id", reviewId).maybeSingle();
  if (reviewError) {
    logQueryError("purge review lookup", reviewError);
    return NextResponse.json({ error: "Couldn't look up the review." }, { status: 400 });
  }
  if (!review) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }
  if (review.status !== "removed") {
    return NextResponse.json({ error: "Only removed reviews can have photos purged." }, { status: 400 });
  }

  const { data: photos, error: photosError } = await admin.from("review_photos").select("storage_path").eq("review_id", reviewId);
  if (photosError) {
    logQueryError("purge photo lookup", photosError);
    return NextResponse.json({ error: "Couldn't read the review's photos." }, { status: 400 });
  }
  const paths = ((photos ?? []) as { storage_path: string }[]).map((p) => p.storage_path);
  if (paths.length === 0) {
    return NextResponse.json({ removed: 0 });
  }

  const { error: removeError } = await admin.storage.from("review-photos").remove(paths);
  if (removeError) {
    logQueryError("purge storage remove", removeError);
    return NextResponse.json({ error: "Couldn't delete the photo files." }, { status: 400 });
  }

  const { error: deleteError } = await admin.from("review_photos").delete().eq("review_id", reviewId);
  if (deleteError) {
    logQueryError("purge photo rows", deleteError);
    return NextResponse.json({ error: "Couldn't delete the photo records." }, { status: 400 });
  }

  return NextResponse.json({ removed: paths.length });
}
