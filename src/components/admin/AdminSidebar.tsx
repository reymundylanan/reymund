"use client";

import { BarChart3, Bell, Building2, LayoutDashboard, SquareKanban, Star, Users, Wallet } from "lucide-react";
import PortalSidebar from "@/components/portal/PortalSidebar";
import { usePortalBadges } from "@/lib/hooks/usePortalBadges";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, section: "Overview" },
  { href: "/admin/users", label: "Users & Roles", icon: Users, section: "Manage" },
  { href: "/admin/payments", label: "Payments & Financials", icon: Wallet, section: "Manage" },
  { href: "/admin/branches", label: "Branches & Services", icon: Building2, section: "Manage" },
  { href: "/admin/multi-branch", label: "Multi-Branch", icon: SquareKanban, section: "Manage" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, section: "Clients" },
  { href: "/admin/reviews", label: "Reviews", icon: Star, section: "Clients" },
  { href: "/admin/reports", label: "Reports", icon: BarChart3, section: "Insights" },
];

export default function AdminSidebar() {
  const badges = usePortalBadges("admin");
  return <PortalSidebar items={navItems} rootHref="/admin" badges={badges} />;
}
