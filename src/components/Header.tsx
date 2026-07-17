"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Sparkles } from "lucide-react";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import MyBookingsPanel from "@/components/MyBookingsPanel";
import ChatWidget from "@/components/ChatWidget";

const navLinks = [
  { label: "Services", href: "/services" },
  { label: "Branches", href: "/branches" },
  { label: "Teams", href: "/#team" },
  { label: "About Us", href: "/about" },
];

function seenBookingIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem("glowsync_seen_bookings") ?? "[]");
  } catch {
    return [];
  }
}

export default function Header() {
  const { open } = useLoginModal();
  const { user } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);

  const checkUnseen = useCallback(async () => {
    if (!user?.id) return;
    const supabase = createClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("client_id", user.id)
      .eq("status", "confirmed")
      .gte("scheduled_date", cutoff.toISOString().slice(0, 10));

    const seen = seenBookingIds();
    const unseen = (data ?? []).filter((row) => !seen.includes(row.id));
    setUnseenCount(unseen.length);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    checkUnseen();

    const supabase = createClient();
    const channel = supabase
      .channel(`customer-notify-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "appointments",
          filter: `client_id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as { status: string };
          const prev = payload.old as { status: string };
          if (next.status === "confirmed" && prev.status !== "confirmed") {
            setUnseenCount((n) => n + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, checkUnseen]);

  async function handleOpenBookings() {
    setBookingsOpen(true);
    if (!user?.id) return;
    const supabase = createClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("client_id", user.id)
      .eq("status", "confirmed")
      .gte("scheduled_date", cutoff.toISOString().slice(0, 10));

    const ids = (data ?? []).map((row) => row.id);
    const merged = Array.from(new Set([...seenBookingIds(), ...ids]));
    localStorage.setItem("glowsync_seen_bookings", JSON.stringify(merged));
    setUnseenCount(0);
  }

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
                      isActive ? "text-base font-bold text-coral-dark" : ""
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
                <button
                  onClick={handleOpenBookings}
                  className="relative hidden rounded-full border border-rose/60 px-5 py-2 text-sm font-semibold text-coral-dark hover:bg-blush sm:inline"
                >
                  My Bookings
                  {unseenCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-semibold text-white ring-2 ring-white">
                      {unseenCount}
                    </span>
                  )}
                </button>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-semibold text-coral-dark">
                  {user.fullName.charAt(0)}
                </span>
                <span className="hidden text-sm font-medium text-ink sm:inline">
                  {user.fullName}
                </span>
                <button
                  onClick={handleLogout}
                  aria-label="Logout"
                  className="rounded-full p-2 text-ink/50 hover:bg-blush hover:text-coral-dark"
                >
                  <LogOut className="h-4 w-4" />
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

      {bookingsOpen && user && (
        <MyBookingsPanel userId={user.id} onClose={() => setBookingsOpen(false)} />
      )}

      {user?.role === "customer" && <ChatWidget />}
    </header>
  );
}
