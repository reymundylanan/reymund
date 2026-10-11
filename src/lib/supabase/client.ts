import { createBrowserClient } from "@supabase/ssr";
import { quietNetworkDrops } from "@/lib/networkNoise";

// A dropped connection during the login session refresh is logged by the
// auth library as a raw "Failed to fetch"; show it as one short warning instead.
quietNetworkDrops();

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
