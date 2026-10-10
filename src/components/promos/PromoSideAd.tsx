"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { useBooking } from "@/components/booking/BookingContext";
import { promoImage } from "@/lib/promoImage";
import BookPromoButton from "@/components/promos/BookPromoButton";
import { rankPromos, readDismissedPromos, type ClientHistory, type PromoCandidate } from "@/lib/promoPicker";

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
const COLLAPSED_KEY = "glowsync-promos-hidden";

function readCollapsed(): boolean {
  try {
    return sessionStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(v: boolean) {
  try {
    sessionStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {
    // Storage blocked — it just won't be remembered across pages.
  }
}

/** Non-blocking promo ad for signed-in clients: a fixed card on the right
 * (desktop/tablet) or a compact banner at the bottom (mobile). It rotates
 * through every promo active today (best match first). Hiding it tucks it
 * into a small "Promos" tab on the edge of the screen; tapping the tab brings
 * it back. It stays hidden across pages until reopened (this browser tab). */
export default function PromoSideAd() {
  const pathname = usePathname() ?? "/";
  const { user } = useCurrentUser();
  const { isOpen: loginOpen } = useLoginModal();
  const { isOpen: bookingOpen } = useBooking();

  const [data, setData] = useState<{ promos: AdPromo[]; history: ClientHistory } | null>(null);
  const [dismissed] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readDismissedPromos()));
  const [collapsed, setCollapsed] = useState(() => (typeof window === "undefined" ? false : readCollapsed()));
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Slide direction for the animation: 1 = next, -1 = previous.
  const [dir, setDir] = useState(1);
  const [chatOverlay, setChatOverlay] = useState(false);

  // A new page starts from the best-matching promo (render-time reset,
  // the React-recommended alternative to a setState-in-effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
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

  const showing = ready && !chatOverlay && count > 1 && !paused && !collapsed;
  // A fresh timer per slide, so a manual flip always gets the full time.
  useEffect(() => {
    if (!showing) return;
    const t = setTimeout(() => {
      setDir(1);
      setIndex((i) => i + 1);
    }, ROTATE_MS);
    return () => clearTimeout(t);
  }, [showing, index]);

  const hidden =
    !ready ||
    chatOverlay ||
    !isClient ||
    !promo ||
    loginOpen ||
    bookingOpen ||
    HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname === `/promos/${promo.id}`;

  if (hidden || !promo) return null;

  const href = `/promos/${promo.id}`;
  // Same destination as the promo page's own "Book Now" button.
  const bookHref = promo.category ? `/services?category=${encodeURIComponent(promo.category)}` : "/services";
  const image = promoImage(promo);
  // The chat button sits bottom-right on every client page except My Glow.
  const chatVisible = !pathname.startsWith("/my-glow");

  function hide(v: boolean) {
    setCollapsed(v);
    saveCollapsed(v);
  }

  function go(step: number) {
    setDir(step < 0 ? -1 : 1);
    setIndex((current + step + count) % count);
  }

  const slide = dir < 0 ? "promo-slide-prev" : "promo-slide-next";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => hide(false)}
        aria-label={`Show promotions (${count})`}
        className={`promo-tab-in fixed z-40 flex items-center gap-1.5 bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] font-semibold text-white shadow-lg shadow-[#a8843a]/30 transition hover:brightness-105
          bottom-[calc(env(safe-area-inset-bottom)_+_14px)] left-3 rounded-full px-3.5 py-2 text-xs
          sm:bottom-auto sm:left-auto sm:right-0 sm:top-1/2 sm:-translate-y-1/2 sm:flex-col sm:rounded-l-2xl sm:rounded-r-none sm:px-2 sm:py-3.5`}
      >
        <Gift className="h-4 w-4" />
        <span className="sm:[writing-mode:vertical-rl] sm:rotate-180 sm:tracking-wide">Promos</span>
        <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-bold tabular-nums">{count}</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="GlowSync promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`promo-ad-in fixed z-40 bottom-[calc(env(safe-area-inset-bottom)_+_12px)] left-3 ${
        chatVisible ? "right-[84px]" : "right-3"
      } sm:left-auto sm:right-6 sm:bottom-24 sm:w-[270px] lg:bottom-auto lg:top-1/2 lg:-translate-y-[60%] lg:w-[290px] xl:w-[310px]`}
    >
      <div className="promo-float">
        <div className="promo-ad-border promo-ad-glow rounded-2xl p-[2px] sm:rounded-[1.6rem]">
          <div className="relative overflow-hidden rounded-[14px] bg-white sm:rounded-[1.5rem]">
            <button
              type="button"
              onClick={() => hide(true)}
              aria-label="Hide promotions (you can open them again from the Promos tab)"
              title="Hide — open again from the Promos tab"
              className="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-full bg-white/90 py-1 pl-2 pr-1.5 text-[11px] font-semibold text-ink/60 shadow-sm backdrop-blur transition hover:text-ink"
            >
              Hide <ChevronRight className="h-3.5 w-3.5" />
            </button>

            {/* Mobile: compact banner */}
            <div key={`m-${promo.id}`} className={`${slide} flex items-center gap-3 p-2 pr-8 sm:hidden`}>
              <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                  <Image src={image} alt="" fill sizes="56px" className="promo-kenburns object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-coral-dark">
                    {promo.badge ?? "GlowSync Promo"}
                  </span>
                  <span className="block truncate text-sm font-semibold text-ink">{promo.title}</span>
                  {count > 1 && <span className="block text-[11px] text-ink/45">{current + 1} of {count} promos</span>}
                </span>
              </Link>
              <BookPromoButton
                promoId={promo.id}
                fallbackHref={bookHref}
                label="Book"
                className="promo-btn inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm [&>svg]:h-3.5 [&>svg]:w-3.5"
              />
            </div>

            {/* Tablet & desktop: card */}
            <div className="hidden sm:block">
              <div key={promo.id} className={slide}>
                <Link href={href} className="block">
                  <span className="relative block h-36 w-full overflow-hidden lg:h-40">
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="(min-width: 1280px) 310px, (min-width: 1024px) 290px, 270px"
                      className="promo-kenburns object-cover"
                    />
                    <span className="absolute inset-0 bg-gradient-to-t from-[#2b1a10]/70 via-[#2b1a10]/10 to-transparent" />
                    <span className="absolute left-3 top-3 max-w-[75%] truncate rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-coral-dark backdrop-blur">
                      {promo.branchName ?? "GlowSync Promo"}
                    </span>
                    {promo.badge && (
                      <span className="promo-btn absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
                        {promo.badge}
                      </span>
                    )}
                  </span>
                  <span className="block px-4 pt-3.5">
                    <span className="line-clamp-2 block text-base font-semibold leading-snug tracking-tight text-ink">{promo.title}</span>
                    {promo.description && <span className="mt-1 line-clamp-2 block text-sm text-ink/60">{promo.description}</span>}
                  </span>
                </Link>
                <div className="flex gap-2 px-4 pb-3 pt-3">
                  <BookPromoButton
                    promoId={promo.id}
                    fallbackHref={bookHref}
                    className="promo-btn inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold text-white shadow-sm"
                  />
                  <Link
                    href={href}
                    className="flex-1 rounded-full border border-champagne py-2 text-center text-sm font-semibold text-ink/70 transition hover:border-coral hover:text-ink"
                  >
                    View Promo
                  </Link>
                </div>
              </div>

              {count > 1 && (
                <div className="flex items-center gap-2 border-t border-champagne/50 px-3 py-2 text-xs text-ink/50">
                  <button type="button" onClick={() => go(-1)} aria-label="Previous promo" className="rounded-full p-1 transition hover:bg-blush hover:text-ink">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {/* Fills up until the next promo slides in; pauses on hover. */}
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-champagne/40">
                    <span
                      key={`${promo.id}-${paused}`}
                      className="promo-progress block h-full rounded-full bg-gradient-to-r from-champagne to-coral"
                      style={{ animationDuration: `${ROTATE_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
                    />
                  </span>
                  <span className="min-w-[3.25rem] text-center font-medium tabular-nums">
                    {current + 1} / {count}
                  </span>
                  <button type="button" onClick={() => go(1)} aria-label="Next promo" className="rounded-full p-1 transition hover:bg-blush hover:text-ink">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
