"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, ChevronRight, LogIn, LogOut, Menu, X } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";
import type { CurrentUser } from "@/lib/hooks/useCurrentUser";

const BOOKING_SERVICE = { name: "GlowSync Booking", duration: "", price: 0 };

/** Phones and small tablets: the header's links don't fit, so a menu
 * button opens this slide-in panel with the same links and account actions. */
export default function MobileNavPanel({
  links,
  user,
  onLogin,
  onLogout,
}: {
  links: { label: string; href: string }[];
  user: CurrentUser | null;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { open: openBooking } = useBooking();
  const [open, setOpen] = useState(false);

  // Close when the page changes (render-time reset, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // While open: Escape closes it and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => (href.includes("#") ? false : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        className="rounded-full p-2 text-ink/70 hover:bg-blush hover:text-coral-dark md:hidden"
      >
        <Menu className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="mobile-nav-fade absolute inset-0 bg-black/40" />

          <div
            id="mobile-nav-panel"
            className="mobile-nav-slide absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-[#FFFDF8] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-nude/70 px-5 py-4">
              <span className="font-display text-lg font-semibold text-coral-dark">Menu</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-full p-2 text-ink/60 hover:bg-blush hover:text-ink">
                <X className="h-6 w-6" />
              </button>
            </div>

            {user && (
              <Link
                href={user.role === "customer" ? "/my-glow/profile" : user.role === "admin" ? "/admin" : "/frontdesk"}
                className="flex items-center gap-3 border-b border-nude/70 px-5 py-4 hover:bg-skin"
              >
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush font-semibold text-coral-dark">
                  {user.avatarUrl ? <Image src={user.avatarUrl} alt="" fill sizes="44px" className="object-cover" /> : user.fullName.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{user.fullName}</span>
                  <span className="block text-xs text-ink/50">
                    {user.role === "customer" ? "View my profile" : user.role === "admin" ? "Open Admin" : "Open Front Desk"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-ink/30" />
              </Link>
            )}

            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <ul className="space-y-1">
                {links.map((link) => {
                  const active = isActive(link.href);
                  return (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center justify-between rounded-xl px-4 py-3.5 text-base font-medium transition ${
                          active ? "bg-coral text-white shadow-sm" : "text-ink/80 hover:bg-skin hover:text-ink"
                        }`}
                      >
                        {link.label}
                        <ChevronRight className={`h-4 w-4 ${active ? "text-white/80" : "text-ink/30"}`} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="space-y-2 border-t border-nude/70 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {(!user || user.role === "customer") && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openBooking(BOOKING_SERVICE);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-coral py-3 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark"
                >
                  <CalendarPlus className="h-4 w-4" /> Book Now
                </button>
              )}
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-champagne py-3 text-sm font-semibold text-ink/70 hover:border-coral"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onLogin();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-champagne py-3 text-sm font-semibold text-ink/70 hover:border-coral"
                >
                  <LogIn className="h-4 w-4" /> Login
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
