import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseStarFilter } from "@/lib/reviews";
import { getServiceReviewPage } from "@/lib/supabase/queries/serviceReviews";
import { signPublicReviewPhotos } from "@/lib/supabase/reviewPhotoUrls";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid service" }, { status: 400 });

  const url = new URL(request.url);
  const rawOffset = url.searchParams.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if (!/^\d+$/.test(rawOffset) || !Number.isInteger(offset) || offset < 0 || offset > 1000) {
    return NextResponse.json({ error: "Invalid offset" }, { status: 400 });
  }
  const filter = parseStarFilter(url.searchParams.get("filter"));

  const result = await getServiceReviewPage(await createClient(), signPublicReviewPhotos, id, filter, offset);
  return NextResponse.json(result);
}
