"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Re-renders the (server) appointment page when the Front Desk verifies
 * the payment or confirms/changes the booking. */
export default function AppointmentLiveRefresh({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`appt-live-${appointmentId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments", filter: `id=eq.${appointmentId}` }, () =>
        router.refresh()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `appointment_id=eq.${appointmentId}` }, () =>
        router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointmentId, router]);
  return null;
}
