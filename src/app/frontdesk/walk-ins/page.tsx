"use client";

import { useCallback, useEffect, useState } from "react";
import WalkinsHeader from "@/components/frontdesk/payments/WalkinsHeader";
import WalkinRegistrationPanel from "@/components/frontdesk/payments/WalkinRegistrationPanel";
import WalkinsListTable from "@/components/frontdesk/payments/WalkinsListTable";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { getTodaysWalkins, type WalkinRow } from "@/lib/supabase/queries/walkins";

export default function FrontDeskWalkinsPage() {
  const { profile } = useStaffProfile();
  const [entries, setEntries] = useState<WalkinRow[]>([]);

  const refresh = useCallback(() => {
    if (!profile?.branchId) return;
    const supabase = createClient();
    getTodaysWalkins(supabase, profile.branchId, toDateKey(new Date())).then(setEntries);
  }, [profile?.branchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <WalkinsHeader />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <WalkinRegistrationPanel onRegistered={refresh} />
        <WalkinsListTable entries={entries} onChanged={refresh} />
      </div>
    </div>
  );
}
