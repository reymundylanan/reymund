import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig } from "@/lib/messenger/config";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function POST() {
  const config = getMessengerConfig();
  if (!config) {
    return NextResponse.json({ error: "Messenger isn't available right now." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "customer") {
    return NextResponse.json({ error: "Only client accounts can connect Messenger." }, { status: 403 });
  }

  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient()
    .from("messenger_link_tokens")
    .insert({ token, profile_id: auth.user.id, expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() });

  if (error) {
    console.error("Creating messenger link token failed:", error);
    return NextResponse.json({ error: "Couldn't start Messenger connect. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ url: `https://m.me/${encodeURIComponent(config.pageUsername)}?ref=${token}` });
}
