"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Sparkles } from "lucide-react";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";

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
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50">
      <div className="bg-coral px-4 py-2 text-center text-sm text-white">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Exclusive Mother&apos;s Day Special: Get 20% off all Floral Therapy
          sessions.{" "}
          <a href="#promotions" className="underline underline-offset-2">
            Learn More
          </a>
        </span>
      </div>

      <div className="border-b border-rose/60 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/logo/blushnewlogo.jpeg"
              alt="Blush Spa & Aesthetics"
              width={46}
              height={46}
              className="h-[46px] w-[46px] object-contain"
            />
            <span className="text-xl font-semibold text-coral-dark">
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

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-semibold text-coral-dark">
                  {user.fullName.charAt(0)}
                </span>
                <span className="hidden text-sm font-medium text-ink sm:inline">
                  {user.fullName}
                </span>
                <button
                  onClick={handleLogout}
                  aria-label="Logout"
                  className="rounded-full p-3 text-ink/50 hover:bg-blush hover:text-coral-dark"
                >
                  <LogOut className="h-6 w-6" />
                </button>
              </div>
            ) : (
              <button
                onClick={open}
                className="rounded-full bg-coral px-5 py-2 text-lg font-semibold text-white transition hover:bg-coral-dark"
              >
                Login
              </button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
