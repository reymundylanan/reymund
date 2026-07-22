"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronLeft,
  LayoutDashboard,
  LogOut,
  UserCog,
  Users2,
  Wallet2,
} from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/frontdesk", label: "Dashboard", icon: LayoutDashboard },
  { href: "/frontdesk/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/frontdesk/payments", label: "Payments & Walk-ins", icon: Wallet2 },
  { href: "/frontdesk/clients", label: "Clients", icon: Users2 },
  { href: "/frontdesk/staff", label: "Staff Schedule", icon: UserCog },
];

export default function FrontDeskSidebar() {
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
      className={`flex h-screen flex-col transition-all ${
        collapsed ? "w-20" : "w-64"
      }`}
      style={{ backgroundColor: "#8D6F5D", borderRight: "1px solid #7a5f4f" }}
    >
      <div className="flex items-center justify-center px-5 py-6">
        {!collapsed && (
          <span className="whitespace-nowrap text-2xl font-bold" style={{ color: "#C89D4B" }}>
            BLUSH Desk
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition"
              style={
                active
                  ? { backgroundColor: "#C89D4B", color: "#fff" }
                  : { color: "rgba(255,255,255,0.75)" }
              }
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "#7a5f4f";
                  (e.currentTarget as HTMLElement).style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)";
                }
              }}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <span className="whitespace-nowrap">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 px-3 py-4" style={{ borderTop: "1px solid #7a5f4f" }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition"
          style={{ color: "rgba(255,255,255,0.6)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#7a5f4f";
            (e.currentTarget as HTMLElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
          }}
        >
          <ChevronLeft
            className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`}
          />
          {!collapsed && <span className="whitespace-nowrap">Collapse Sidebar</span>}
        </button>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition"
          style={{ color: "rgba(255,255,255,0.6)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#7a5f4f";
            (e.currentTarget as HTMLElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
          }}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Logout</span>}
        </button>
      </div>

      {!collapsed && (
        <p className="px-5 py-3 text-[11px]" style={{ borderTop: "1px solid #7a5f4f", color: "rgba(255,255,255,0.3)" }}>
          © 2024 Blush Spa &amp; Aesthetics &bull; System Online &bull; Ver
          1.4.2-stable &bull; Support Center
        </p>
      )}
    </aside>
  );
}
