"use client";

import { signOutSafely } from "@/lib/auth/signOut";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import AnnouncementBar from "@/components/AnnouncementBar";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import ClientNotificationBell from "@/components/notifications/ClientNotificationBell";
import { createClient } from "@/lib/supabase/client";
import MobileNavPanel from "@/components/MobileNavPanel";

const baseNavLinks = [
  { label: "Services", href: "/services" },
  { label: "Branches", href: "/branches" },
  { label: "Teams", href: "/#team" },
  { label: "About Us", href: "/about" },
];

export default function Header() {
  const { open } = useLoginModal();
  const { user } = useCurrentUser();
  const navLinks =
    user?.role === "customer"
      ? [...baseNavLinks, { label: "My Glow", href: "/my-glow" }]
      : baseNavLinks;
  const pathname = usePathname();

  async function handleLogout() {
    // Works even if Supabase can't be reached; a full reload drops any cached user.
    await signOutSafely(createClient());
    window.location.assign(pathname || "/");
  }

  const avatarCircle = user ? (
    <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-semibold text-coral-dark">
      {user.avatarUrl ? (
        <Image src={user.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
      ) : (
        user.fullName.charAt(0)
      )}
    </span>
  ) : null;
  const nameLabel = user ? (
    <span className="hidden text-sm font-medium text-ink sm:inline">
      {user.fullName}
    </span>
  ) : null;

  return (
    <header className="sticky top-0 z-50">
      <AnnouncementBar />

      <div className="border-b border-nude/70 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src="/images/logo/blushnewlogo.jpeg"
              alt="Blush Spa & Aesthetics"
              width={46}
              height={46}
              className="h-10 w-10 shrink-0 object-contain sm:h-[46px] sm:w-[46px]"
            />
            <span className="truncate font-display text-lg font-semibold text-coral-dark sm:text-2xl">
              Blush Spa & Aesthetics
            </span>
          </Link>

          <ul className="hidden items-center gap-8 text-lg font-medium text-ink/80 md:flex">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className={`transition hover:text-coral-dark ${
                      isActive ? "text-xl font-bold text-coral-dark" : ""
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex shrink-0 items-center gap-1 sm:gap-4">
            {user ? (
              <div className="flex items-center gap-1 sm:gap-3">
                {user.role === "customer" && <ClientNotificationBell clientId={user.id} />}
                {user.role === "customer" ? (
                  <Link
                    href="/my-glow/profile"
                    aria-label="My profile"
                    className="flex items-center gap-3 rounded-full hover:opacity-80"
                  >
                    {avatarCircle}
                    {nameLabel}
                  </Link>
                ) : (
                  <>
                    {avatarCircle}
                    {nameLabel}
                  </>
                )}
                <button
                  onClick={handleLogout}
                  aria-label="Logout"
                  className="hidden rounded-full p-3 text-ink/50 hover:bg-blush hover:text-coral-dark md:inline-flex"
                >
                  <LogOut className="h-6 w-6" />
                </button>
              </div>
            ) : (
              <button
                onClick={open}
                className="rounded-full bg-coral px-4 py-1.5 text-base font-semibold text-white transition hover:bg-coral-dark sm:px-5 sm:py-2 sm:text-lg"
              >
                Login
              </button>
            )}
            <MobileNavPanel links={navLinks} user={user} onLogin={open} onLogout={handleLogout} />
          </div>
        </nav>

        {/* Phones: the main links stay visible in a strip under the header. */}
        <ul className="scrollbar-hidden flex gap-2 overflow-x-auto border-t border-nude/50 px-4 py-2 md:hidden">
          {navLinks.map((link) => {
            const isActive = !link.href.includes("#") && (pathname === link.href || pathname.startsWith(`${link.href}/`));
            return (
              <li key={link.label} className="shrink-0">
                <Link
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`block rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    isActive ? "bg-coral text-white shadow-sm" : "bg-[#F6EEE2] text-ink/80 hover:bg-[#F0E4D3] hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </header>
  );
}
