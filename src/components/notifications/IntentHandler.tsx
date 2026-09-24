"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBooking } from "@/components/booking/BookingContext";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { createClient } from "@/lib/supabase/client";

const PLACEHOLDER_SERVICE = { name: "GlowSync Booking", duration: "", price: 0 };

export default function IntentHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openBooking } = useBooking();
  const { open: openLogin } = useLoginModal();

  useEffect(() => {
    const intent = searchParams.get("intent");
    if (intent !== "booking") return;

    const supabase = createClient();
    let cancelled = false;

    async function resolve() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!data.user) {
        openLogin();
        return;
      }

      await openBooking(PLACEHOLDER_SERVICE);
      if (cancelled) return;
      const params = new URLSearchParams(searchParams.toString());
      params.delete("intent");
      const rest = params.toString();
      router.replace(rest ? `?${rest}` : window.location.pathname);
    }

    resolve();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") resolve();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}
