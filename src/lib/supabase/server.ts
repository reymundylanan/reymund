import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { retryingFetch } from "./retryFetch";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // A dropped connection retries a read instead of emptying the page.
      global: { fetch: retryingFetch() },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — safe to ignore
            // when middleware refreshes the session.
          }
        },
      },
    }
  );
}
