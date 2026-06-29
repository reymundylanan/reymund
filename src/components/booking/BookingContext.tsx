"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import BookingModal from "@/components/booking/BookingModal";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { createClient } from "@/lib/supabase/client";

export type BookableService = {
  name: string;
  duration: string;
  price: number;
};

type BookingContextValue = {
  open: (service: BookableService) => void;
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<BookableService | null>(null);
  const { open: openLogin } = useLoginModal();

  async function open(nextService: BookableService) {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      openLogin();
      return;
    }

    setService(nextService);
  }

  return (
    <BookingContext.Provider value={{ open }}>
      {children}
      {service && (
        <BookingModal service={service} onClose={() => setService(null)} />
      )}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within BookingProvider");
  return ctx;
}
