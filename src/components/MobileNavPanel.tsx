"use client";

import { useEffect, useState, type ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { CalendarPlus, ChevronRight, Heart, Info, LogIn, LogOut, MapPin, Menu, Sparkles, Users, X } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";
import type { CurrentUser } from "@/lib/hooks/useCurrentUser";

const BOOKING_SERVICE = { name: "GlowSync Booking", duration: "", price: 0 };

// An icon for each header link (unknown links get a sparkle).
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/services": Sparkles,
  "/branches": MapPin,
  "/#team": Users,
  "/about": Info,
  "/my-glow": Heart,
};

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

  const isActive = (href: string) =>
    href.includes("#") ? false : href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const items = links;

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

      {open &&
        createPortal(
            <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="mobile-nav-fade absolute inset-0 bg-black/40" />

              <div
                id="mobile-nav-panel"
                className="mobile-nav-slide absolute inset-y-0 right-0 flex w-[min(20rem,86vw)] flex-col rounded-l-[1.75rem] bg-[#FFFDF8] shadow-2xl"
              >
                <div className="flex items-center justify-between px-6 pb-3 pt-6">
                  <span className="font-display text-3xl font-semibold text-ink">Menu</span>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="-mr-2 rounded-full p-2 text-ink/70 hover:bg-skin hover:text-ink">
                    <X className="h-7 w-7" strokeWidth={1.75} />
                  </button>
                </div>

                {user && (
                  <Link
                    href={user.role === "customer" ? "/my-glow/profile" : pathname}
                    onClick={() => setOpen(false)}
                    className="mx-4 mb-2 flex items-center gap-3 rounded-2xl bg-[#F6EEE2] px-4 py-3.5 transition hover:bg-[#F0E4D3]"
                  >
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush font-semibold text-coral-dark ring-2 ring-white">
                      {user.avatarUrl ? <Image src={user.avatarUrl} alt="" fill sizes="48px" className="object-cover" /> : user.fullName.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{user.fullName}</span>
                      {user.role === "customer" && <span className="block text-xs text-ink/55">View my profile</span>}
                    </span>
                    {user.role === "customer" && <ChevronRight className="h-5 w-5 text-ink/40" />}
                  </Link>
                )}

                <nav className="flex-1 overflow-y-auto px-4 py-2">
                  <ul className="space-y-1">
                    {items.map((link) => {
                      const active = isActive(link.href);
                      const Icon = ICONS[link.href] ?? Sparkles;
                      return (
                        <li key={link.label}>
                          <Link
                            href={link.href}
                            onClick={() => setOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-[15px] transition ${
                              active ? "bg-[#F1E4D0] font-semibold text-ink" : "font-medium text-ink/80 hover:bg-[#F8F1E7] hover:text-ink"
                            }`}
                          >
                            <Icon className={`h-5 w-5 shrink-0 ${active ? "text-coral-dark" : "text-ink/70"}`} />
                            <span className="flex-1">{link.label}</span>
                            <ChevronRight className="h-4 w-4 text-ink/35" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                <div className="mx-4 space-y-2 border-t border-nude/70 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
            </div>,
          document.body
        )}
    </>
  );
}
