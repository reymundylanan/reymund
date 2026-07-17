"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type StaffProfile = {
  fullName: string;
  role: "admin" | "front_desk";
  branchId: string | null;
  branchName: string | null;
  avatarUrl: string | null;
};

export function useStaffProfile() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("full_name, role, branch_id, avatar_url, branches(name)")
        .eq("id", auth.user.id)
        .single();

      if (data) {
        const branches = data.branches as { name: string }[] | { name: string } | null;
        const branchName = Array.isArray(branches)
          ? branches[0]?.name ?? null
          : branches?.name ?? null;

        setProfile({
          fullName: data.full_name,
          role: data.role,
          branchId: data.branch_id,
          branchName,
          avatarUrl: data.avatar_url ?? null,
        });
      }
      setLoading(false);
    }

    load();
  }, []);

  return { profile, loading };
}
