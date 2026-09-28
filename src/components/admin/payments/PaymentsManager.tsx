"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAdminPayments, computeStats, type AdminPaymentRow } from "@/lib/supabase/queries/adminPayments";
import PaymentsStats from "@/components/admin/payments/PaymentsStats";
import TransactionsTable from "@/components/admin/payments/TransactionsTable";

export default function PaymentsManager() {
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const rows = await getAdminPayments(supabase);
    setPayments(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("admin-payments-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        setLive(true);
        setTimeout(() => setLive(false), 2000);
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const stats = computeStats(payments);

  return (
    <div className="space-y-6">
      <PaymentsStats stats={stats} live={live} />
      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-ink/40 shadow-sm">
          Loading payments…
        </div>
      ) : (
        <TransactionsTable payments={payments} />
      )}
    </div>
  );
}
