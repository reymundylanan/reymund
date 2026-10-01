"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_BRANCH_EVENT, pickBranch, readAdminBranchCookie } from "@/lib/adminBranch";

export type StaffProfile = {
  fullName: string;
  role: "admin" | "front_desk";
  branchId: string | null;
  branchName: string | null;
  avatarUrl: string | null;
};

type BranchOption = { id: string; name: string };

/** The signed-in staff member. For Admin, branchId / branchName are the
 * branch chosen in the Front Desk header (Admins have no branch of their
 * own), so every Front Desk screen works for them too. */
export function useStaffProfile() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let adminBranches: BranchOption[] = [];

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("full_name, role, branch_id, avatar_url, branches(name)")
        .eq("id", auth.user.id)
        .single();

      if (data && !cancelled) {
        const rel = data.branches as { name: string }[] | { name: string } | null;
        const ownName = Array.isArray(rel) ? rel[0]?.name ?? null : rel?.name ?? null;
        let branchId: string | null = data.branch_id;
        let branchName: string | null = ownName;

        if (data.role === "admin") {
          const { data: list } = await supabase.from("branches").select("id, name").order("name");
          adminBranches = (list ?? []) as BranchOption[];
          branchId = pickBranch(adminBranches.map((b) => b.id), readAdminBranchCookie(document.cookie), data.branch_id);
          branchName = adminBranches.find((b) => b.id === branchId)?.name ?? null;
          if (!cancelled) setBranches(adminBranches);
        }

        if (!cancelled) {
          setProfile({
            fullName: data.full_name,
            role: data.role,
            branchId,
            branchName,
            avatarUrl: data.avatar_url ?? null,
          });
        }
      }
      if (!cancelled) setLoading(false);
    }

    load();

    // Admin switched branch in the header (this or another component).
    const onBranch = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const match = adminBranches.find((b) => b.id === id);
      if (!match) return;
      setProfile((p) => (p && p.role === "admin" ? { ...p, branchId: match.id, branchName: match.name } : p));
    };
    window.addEventListener(ADMIN_BRANCH_EVENT, onBranch);
    return () => {
      cancelled = true;
      window.removeEventListener(ADMIN_BRANCH_EVENT, onBranch);
    };
  }, []);

  return { profile, loading, branches };
}
