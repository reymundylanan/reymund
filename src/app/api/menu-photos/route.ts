import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("branch_gallery")
    .select("id, image_url")
    .is("branch_id", null)
    .eq("category", "menu")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const photos = (data ?? []).map((row) => ({
    id: row.id as string,
    imageUrl: row.image_url as string,
  }));

  return NextResponse.json({ photos });
}
