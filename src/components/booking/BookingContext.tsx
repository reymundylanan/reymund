"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import BookingModal from "@/components/booking/BookingModal";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { createClient } from "@/lib/supabase/client";
import { getPromoBranchOptions } from "@/lib/supabase/queries/promoPackages";
import type { PromoPackage } from "@/lib/promoPackage";

export type BookableService = {
  name: string;
  duration: string;
  price: number;
  /** Book Now on a specific service: pre-add it to Selected Services. */
  preselect?: boolean;
  category?: string | null;
  /** Booked from a branch page (branchContacts id): skip choosing the branch. */
  branchId?: string;
};

type BookingContextValue = {
  open: (service: BookableService) => void;
  /** Book a promo package: its services, price and branches come with it. */
  openPromo: (promoId: string) => Promise<"opened" | "login" | "unavailable">;
  isOpen: boolean;
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<BookableService | null>(null);
  const [promoOptions, setPromoOptions] = useState<PromoPackage[] | null>(null);
  const { open: openLogin } = useLoginModal();

  /** Signed in? Otherwise open the login window (booking resumes after). */
  async function signedIn(promoId?: string) {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) return true;
    const params = new URLSearchParams(window.location.search);
    params.set("intent", "booking");
    if (promoId) params.set("promo", promoId);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    openLogin();
    return false;
  }

  async function open(nextService: BookableService) {
    if (!(await signedIn())) return;
    setPromoOptions(null);
    setService(nextService);
  }

  async function openPromo(promoId: string): Promise<"opened" | "login" | "unavailable"> {
    if (!(await signedIn(promoId))) return "login";
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const options = await getPromoBranchOptions(createClient(), promoId, today);
    if (options.length === 0) return "unavailable";
    setPromoOptions(options);
    setService({ name: options[0].title, duration: "", price: options[0].price ?? 0 });
    return "opened";
  }

  function close() {
    setService(null);
    setPromoOptions(null);
  }

  return (
    <BookingContext.Provider value={{ open, openPromo, isOpen: service !== null }}>
      {children}
      {service && (
        <BookingModal
          key={promoOptions?.[0]?.id ?? "service"}
          service={service}
          promoOptions={promoOptions ?? undefined}
          onClose={close}
        />
      )}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within BookingProvider");
  return ctx;
}
