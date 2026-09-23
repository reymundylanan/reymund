"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  ChevronLeft,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users & Roles", icon: Users },
  { href: "/admin/bookings", label: "Bookings Management", icon: CalendarCheck },
  { href: "/admin/payments", label: "Payments & Financials", icon: Wallet },
  { href: "/admin/branches", label: "Branches & Services", icon: Building2 },
  { href: "/admin/reports", label: "Reports & System Settings", icon: Settings },
];

export default function AdminSidebar() {
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
      <div className="flex items-center justify-center px-5 py-5">
        {!collapsed && (
          <span className="whitespace-nowrap text-2xl font-bold text-ink">
            BLUSH Admin
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
            className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`}
          />
          {!collapsed && <span className="whitespace-nowrap">Collapse Sidebar</span>}
        </button>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-ink/60 hover:bg-blush"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Logout</span>}
        </button>
      </div>

      {!collapsed && (
        <p className="border-t border-ink/10 px-5 py-3 text-[11px] text-ink/40">
          © 2026 GlowSync Admin Portal. All rights reserved. System Version
          2.4.0-stable
        </p>
      )}
    </aside>
  );
}
