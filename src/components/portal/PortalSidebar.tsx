"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";
import { ChevronLeft, Heart, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type PortalNavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };

const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

/** Shared Admin / Front Desk sidebar: GlowSync brand, gold active item,
 * cream background. `rootHref` is only active on its exact path. */
export default function PortalSidebar({ items, rootHref, portalLabel }: { items: PortalNavItem[]; rootHref: string; portalLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/");
  }

  const isActive = (href: string) => (href === rootHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <aside
      className={`relative flex h-screen shrink-0 flex-col overflow-hidden border-r border-nude/70 bg-[#FFFDF8] transition-all ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div className={`flex items-center gap-3 px-5 py-6 ${collapsed ? "justify-center" : ""}`}>
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-champagne bg-white">
          <Image src="/images/logo/cropblushicon2.png" alt="GlowSync" fill sizes="44px" className="object-contain p-1" />
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block text-2xl leading-tight text-coral-dark" style={SERIF}>
              GlowSync
            </span>
            <span className="block truncate text-[11px] font-medium tracking-wide text-taupe">
              Blush Spa &amp; Aesthetics · {portalLabel}
            </span>
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
                active ? "bg-coral text-white shadow-sm shadow-coral/30" : "text-ink/65 hover:bg-skin hover:text-ink"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-ink/45 group-hover:text-coral-dark"}`} />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="pointer-events-none px-6 pb-3 text-sm italic leading-snug text-coral-dark/80" style={SERIF} aria-hidden>
          Look Good
          <br />
          Feel Good
          <br />
          Be You <Heart className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" />
        </div>
      )}

      <div className="space-y-1 border-t border-nude/70 px-3 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-skin hover:text-ink ${collapsed ? "justify-center" : ""}`}
        >
          <ChevronLeft className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span className="whitespace-nowrap">Collapse Sidebar</span>}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-skin hover:text-ink ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
