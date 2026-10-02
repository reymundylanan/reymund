"use client";

import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import ChatWidget from "@/components/ChatWidget";
import { useBooking } from "@/components/booking/BookingContext";

export default function ChatWidgetWrapper() {
  const { user } = useCurrentUser();
  const pathname = usePathname();
  const { isOpen: bookingOpen } = useBooking();
  if (user?.role !== "customer") return null;
  // My Glow already has its own inline AssistantPanel — avoid showing two
  // separate chat conversations on the same page.
  if (pathname?.startsWith("/my-glow")) return null;
  // Hidden (not unmounted, so the chat is kept) while booking: on phones
  // the chat head would cover the booking window's buttons.
  return (
    <div className={bookingOpen ? "hidden" : undefined}>
      <ChatWidget firstName={user.fullName?.trim().split(/\s+/)[0] || null} />
    </div>
  );
}
