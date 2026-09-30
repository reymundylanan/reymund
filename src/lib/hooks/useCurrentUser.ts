"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type CurrentUser = {
  id: string;
  fullName: string;
  role: string;
  avatarUrl: string | null;
};

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfile(userId: string) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, role, avatar_url")
        .eq("id", userId)
        .single();

      setUser(
        data
          ? {
              id: userId,
              fullName: data.full_name,
              role: data.role,
              avatarUrl: data.avatar_url ?? null,
            }
          : null
      );
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        loadProfile(data.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          loadProfile(session.user.id).then(() => setLoading(false));
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    const onUpdated = () => {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) loadProfile(data.user.id);
      });
    };
    window.addEventListener("glowsync:profile-updated", onUpdated);

    return () => {
      subscription.subscription.unsubscribe();
      window.removeEventListener("glowsync:profile-updated", onUpdated);
    };
  }, []);

  return { user, loading };
}
