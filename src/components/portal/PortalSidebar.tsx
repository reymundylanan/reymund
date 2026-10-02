"use client";

import { signOutSafely } from "@/lib/auth/signOut";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import { ChevronLeft, Heart, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type PortalNavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };

const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const badgeText = (n: number) => (n > 99 ? "99+" : String(n));

/** Shared Admin / Front Desk sidebar: GlowSync brand, gold active item,
 * cream background. `rootHref` is only active on its exact path.
 * `badges` (by href) shows a count beside an item that needs attention —
 * a small dot on the icon when the sidebar is collapsed or on phones,
 * where it is always icon-only. */
export default function PortalSidebar({
  items,
  rootHref,
  portalLabel,
  badges = {},
}: {
  items: PortalNavItem[];
  rootHref: string;
  portalLabel: string;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    // Works even if Supabase can't be reached (clears this device's session).
    await signOutSafely(createClient());
    window.location.assign("/");
  }

  const isActive = (href: string) => (href === rootHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <aside
      className={`relative flex h-screen shrink-0 flex-col overflow-hidden border-r border-nude/70 bg-[#FFFDF8] transition-all ${
        collapsed ? "w-20" : "w-64 max-md:w-16"
      }`}
    >
      <div className={`flex items-center gap-3 px-5 py-6 max-md:justify-center max-md:px-2 ${collapsed ? "justify-center" : ""}`}>
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-champagne bg-white max-md:h-10 max-md:w-10">
          <Image src="/images/logo/cropblushicon2.png" alt="GlowSync" fill sizes="44px" className="object-contain p-1" />
        </span>
        {!collapsed && (
          <span className="min-w-0 max-md:hidden">
            <span className="block text-2xl leading-tight text-coral-dark" style={SERIF}>
              GlowSync
            </span>
            <span className="block truncate text-[11px] font-medium tracking-wide text-taupe">
              Blush Spa &amp; Aesthetics · {portalLabel}
            </span>
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 max-md:px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const badge = badges[item.href] ?? 0;
          const label = badge > 0 ? `${item.label} (${badgeText(badge)} need attention)` : item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={label}
              aria-label={label}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition max-md:justify-center max-md:px-0 ${
                active ? "bg-coral text-white shadow-sm shadow-coral/30" : "text-ink/65 hover:bg-skin hover:text-ink"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <span className="relative shrink-0">
                <Icon className={`h-5 w-5 ${active ? "text-white" : "text-ink/45 group-hover:text-coral-dark"}`} />
                {/* Dot on the icon: collapsed sidebar, or phones (always icon-only). */}
                {badge > 0 && (
                  <span className={`absolute -right-1.5 -top-1.5 flex h-3 w-3 ${collapsed ? "" : "md:hidden"}`} aria-hidden>
                    <span className="portal-badge-ping absolute inline-flex h-full w-full rounded-full bg-[#d6455d] opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[#d6455d] ring-2 ring-white" />
                  </span>
                )}
              </span>
              {!collapsed && <span className="whitespace-nowrap max-md:hidden">{item.label}</span>}
              {!collapsed && badge > 0 && (
                <span
                  className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums max-md:hidden ${
                    active ? "bg-white text-[#c23a52]" : "bg-[#d6455d] text-white shadow-sm shadow-[#d6455d]/30"
                  }`}
                  aria-hidden
                >
                  {badgeText(badge)}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="pointer-events-none px-6 pb-3 text-sm italic max-md:hidden leading-snug text-coral-dark/80" style={SERIF} aria-hidden>
          Look Good
          <br />
          Feel Good
          <br />
          Be You <Heart className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" />
        </div>
      )}

      <div className="space-y-1 border-t border-nude/70 px-3 py-3 max-md:px-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`flex w-full items-center gap-3 max-md:hidden rounded-xl px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-skin hover:text-ink ${collapsed ? "justify-center" : ""}`}
        >
          <ChevronLeft className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span className="whitespace-nowrap">Collapse Sidebar</span>}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          title="Logout"
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-skin hover:text-ink max-md:justify-center max-md:px-0 ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="whitespace-nowrap max-md:hidden">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
