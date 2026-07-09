"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart2,
  CalendarDays,
  ChevronLeft,
  LayoutDashboard,
  LogOut,
  Users2,
} from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/staff", label: "Dashboard", icon: LayoutDashboard },
  { href: "/staff/schedule", label: "My Schedule", icon: CalendarDays },
  { href: "/staff/clients", label: "My Clients", icon: Users2 },
  { href: "/staff/performance", label: "Performance", icon: BarChart2 },
];

export default function StaffSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <aside
      className={`flex h-screen flex-col border-r border-ink/10 bg-white transition-all ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral text-sm font-bold text-white">
          B
        </span>
        {!collapsed && (
          <span className="whitespace-nowrap text-base font-bold text-ink">
            Blush Staff Portal
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                active
                  ? "bg-coral text-white"
                  : "text-ink/60 hover:bg-blush hover:text-ink"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <span className="whitespace-nowrap">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-ink/10 px-3 py-4">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-ink/60 hover:bg-blush"
        >
          <ChevronLeft
            className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`}
          />
          {!collapsed && <span className="whitespace-nowrap">Collapse</span>}
        </button>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-ink/60 hover:bg-blush"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Logout</span>}
        </button>
      </div>

      {!collapsed && (
        <p className="border-t border-ink/10 px-5 py-3 text-[11px] text-ink/40">
          © 2026 Blush Spa &amp; Aesthetics · Staff Portal
        </p>
      )}
    </aside>
  );
}
