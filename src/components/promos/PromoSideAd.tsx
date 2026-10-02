"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { useBooking } from "@/components/booking/BookingContext";
import { getServiceImage } from "@/lib/serviceImage";
import {
  rankPromos,
  readDismissedPromos,
  rememberDismissedPromo,
  type ClientHistory,
  type PromoCandidate,
} from "@/lib/promoPicker";

type AdPromo = PromoCandidate & {
  description: string | null;
  badge: string | null;
  branchName: string | null;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const APPEAR_DELAY_MS = 2000;
const ROTATE_MS = 6000;
/** Fired by ChatWidget while its greeting card or chat window is open. */
export const CHAT_OVERLAY_EVENT = "glowsync:chat-overlay";
const HIDDEN_PREFIXES = ["/admin", "/frontdesk", "/auth"];

/** Non-blocking promo ad for signed-in clients: a fixed card on the right
 * (desktop/tablet) or a compact banner at the bottom (mobile). It rotates
 * through every promo active today (best match first). Closing it hides it
 * on this page and marks the promos already shown as seen; unseen ones
 * appear on the next page the client opens. */
export default function PromoSideAd() {
  const pathname = usePathname() ?? "/";
  const { user } = useCurrentUser();
  const { isOpen: loginOpen } = useLoginModal();
  const { isOpen: bookingOpen } = useBooking();

  const [data, setData] = useState<{ promos: AdPromo[]; history: ClientHistory } | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readDismissedPromos()
  );
  const [closedOnPath, setClosedOnPath] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [paused, setPaused] = useState(false);
  const [chatOverlay, setChatOverlay] = useState(false);

  // After a close, the next promo waits for the next page. Once the client
  // navigates, forget which page it was closed on (render-time reset,
  // the React-recommended alternative to a setState-in-effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setClosedOnPath(null);
    setIndex(0);
  }

  const isClient = user?.role === "customer";
  const userId = user?.id;

  useEffect(() => {
    if (!isClient || !userId) return;
    let cancelled = false;
    const supabase = createClient();
    // Today in the spa's time zone (UTC would be a day behind before 8 AM).
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    Promise.all([
      supabase
        .from("branch_promotions")
        .select("id, branch_id, title, department, category, description, badge, valid_until, branch:branches(name)")
        .eq("is_active", true)
        .or(`valid_from.is.null,valid_from.lte.${today}`)
        .or(`valid_until.is.null,valid_until.gte.${today}`),
      supabase
        .from("appointments")
        .select("branch_id, status, service:branch_services(category, department)")
        .eq("client_id", userId),
    ]).then(([promosRes, apptsRes]) => {
      if (cancelled) return;
      if (promosRes.error) console.error("PromoSideAd promos failed:", promosRes.error);
      if (apptsRes.error) console.error("PromoSideAd appointments failed:", apptsRes.error);

      const promos = ((promosRes.data ?? []) as unknown as {
        id: string;
        branch_id: string;
        title: string;
        department: string | null;
        category: string | null;
        description: string | null;
        badge: string | null;
        valid_until: string | null;
        branch: Rel<{ name: string }>;
      }[]).map((p) => ({
        id: p.id,
        branchId: p.branch_id,
        title: p.title,
        department: p.department,
        category: p.category,
        validUntil: p.valid_until,
        description: p.description,
        badge: p.badge,
        branchName: one(p.branch)?.name ?? null,
      }));

      const appts = ((apptsRes.data ?? []) as unknown as {
        branch_id: string | null;
        status: string;
        service: Rel<{ category: string | null; department: string | null }>;
      }[]).filter((a) => a.status !== "cancelled");

      const history: ClientHistory = {
        branchIds: appts.flatMap((a) => (a.branch_id ? [a.branch_id] : [])),
        departments: appts.flatMap((a) => (one(a.service)?.department ? [one(a.service)!.department!] : [])),
        bookedCategories: appts.flatMap((a) => (one(a.service)?.category ? [one(a.service)!.category!] : [])),
      };

      setData({ promos, history });
    });

    return () => {
      cancelled = true;
    };
  }, [isClient, userId]);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), APPEAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Stay out of the way while the GlowSync AI greeting card or chat is open.
  useEffect(() => {
    const onChat = (e: Event) => setChatOverlay(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(CHAT_OVERLAY_EVENT, onChat);
    return () => window.removeEventListener(CHAT_OVERLAY_EVENT, onChat);
  }, []);

  const promos = useMemo(() => (data ? rankPromos(data.promos, data.history, dismissed) : []), [data, dismissed]);
  const count = promos.length;
  const current = count ? index % count : 0;
  const promo = promos[current] ?? null;

  const showing = ready && !chatOverlay && count > 1 && !paused && closedOnPath !== pathname;
  useEffect(() => {
    if (!showing) return;
    const t = setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [showing]);

  const hidden =
    !ready ||
    chatOverlay ||
    !isClient ||
    !promo ||
    loginOpen ||
    bookingOpen ||
    closedOnPath === pathname ||
    HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname === `/promos/${promo.id}`;

  if (hidden || !promo) return null;

  const href = `/promos/${promo.id}`;
  // Same destination as the promo page's own "Book Now" button.
  const bookHref = promo.category ? `/services?category=${encodeURIComponent(promo.category)}` : "/services";
  const image = getServiceImage(promo.category ?? promo.department ?? promo.title);
  // The chat button sits bottom-right on every client page except My Glow.
  const chatVisible = !pathname.startsWith("/my-glow");

  function close() {
    const shown = new Set(seen).add(promo!.id);
    shown.forEach((id) => rememberDismissedPromo(id));
    setDismissed((prev) => new Set([...prev, ...shown]));
    setSeen(new Set());
    setClosedOnPath(pathname);
  }

  function go(step: number) {
    setSeen((prev) => new Set(prev).add(promo!.id));
    setIndex((current + step + count) % count);
  }

  const nav =
    count > 1 ? (
      <div className="flex items-center justify-between gap-2 px-4 pb-3 text-xs text-ink/50">
        <button type="button" onClick={() => go(-1)} aria-label="Previous promo" className="rounded-full p-1 hover:bg-blush hover:text-ink">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="flex items-center gap-1.5">
          {promos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => go(i - current)}
              aria-label={`Promo ${i + 1} of ${count}`}
              aria-current={i === current}
              className={`h-1.5 rounded-full transition-all ${i === current ? "w-4 bg-coral" : "w-1.5 bg-ink/20 hover:bg-ink/40"}`}
            />
          ))}
        </span>
        <button type="button" onClick={() => go(1)} aria-label="Next promo" className="rounded-full p-1 hover:bg-blush hover:text-ink">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    ) : null;

  return (
    <aside
      aria-label="GlowSync promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`promo-ad-in fixed z-40 bottom-[calc(env(safe-area-inset-bottom)_+_12px)] left-3 ${
        chatVisible ? "right-[84px]" : "right-3"
      } sm:left-auto sm:right-6 sm:bottom-24 sm:w-[260px] lg:bottom-auto lg:top-1/2 lg:-translate-y-[60%] lg:w-[280px] xl:w-[320px]`}
    >
      <div className="promo-ad-border promo-ad-glow rounded-2xl p-[2px] sm:rounded-3xl">
        <div key={promo.id} className="glowy-msg relative overflow-hidden rounded-[14px] bg-white sm:rounded-[22px]">
          <button
            type="button"
            onClick={close}
            aria-label="Close promotion"
            className="absolute right-1.5 top-1.5 z-10 rounded-full bg-white/90 p-1 text-ink/60 shadow-sm hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {/* Mobile: compact banner */}
          <div className="flex items-center gap-3 p-2 pr-8 sm:hidden">
            <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                <Image src={image} alt="" fill sizes="56px" className="object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                {promo.badge && (
                  <span className="promo-ad-border inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {promo.badge}
                  </span>
                )}
                <span className="block truncate text-sm font-semibold text-ink">{promo.title}</span>
                {promo.description && <span className="block truncate text-xs text-ink/60">{promo.description}</span>}
              </span>
            </Link>
            <Link
              href={bookHref}
              className="promo-ad-border shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              Book Now
            </Link>
          </div>
          {count > 1 && (
            <div className="flex items-center justify-between px-3 pb-2 text-[11px] text-ink/50 sm:hidden">
              <button type="button" onClick={() => go(-1)} aria-label="Previous promo" className="p-0.5"><ChevronLeft className="h-4 w-4" /></button>
              <span>{current + 1} / {count}</span>
              <button type="button" onClick={() => go(1)} aria-label="Next promo" className="p-0.5"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}

          {/* Tablet & desktop: card */}
          <div className="hidden sm:block">
            <Link href={href} className="block">
              <span className="relative block h-28 w-full lg:h-36">
                <Image src={image} alt="" fill sizes="(min-width: 1280px) 320px, (min-width: 1024px) 280px, 260px" className="object-cover" />
                {promo.badge && (
                  <span className="promo-ad-border absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
                    {promo.badge}
                  </span>
                )}
              </span>
              <span className="block px-4 pt-4">
                <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-coral-dark">
                  <span>GlowSync Promo{promo.branchName && <> · {promo.branchName}</>}</span>
                  {count > 1 && <span className="shrink-0 text-ink/40">{current + 1} / {count}</span>}
                </span>
                <span className="mt-0.5 line-clamp-2 block font-semibold text-ink">{promo.title}</span>
                {promo.description && <span className="mt-1 line-clamp-2 block text-sm text-ink/60">{promo.description}</span>}
              </span>
            </Link>
            <div className="flex gap-2 p-4 pt-3">
              <Link
                href={bookHref}
                className="promo-ad-border flex-1 rounded-full py-2 text-center text-sm font-semibold text-white shadow-sm hover:opacity-90"
              >
                Book Now
              </Link>
              <Link
                href={href}
                className="flex-1 rounded-full border border-ink/15 py-2 text-center text-sm font-semibold text-ink/70 hover:border-ink/30 hover:text-ink"
              >
                View Promo
              </Link>
            </div>
            {nav}
          </div>
        </div>
      </div>
    </aside>
  );
}
