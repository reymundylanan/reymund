"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Building2, ClipboardList, UserPlus } from "lucide-react";
import AddMenuModal from "@/components/admin/dashboard/AddMenuModal";

export default function CommandCenter() {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const actions = [
    { label: "Add Branch", icon: Building2, href: "/admin/branches", onClick: null },
    { label: "Manage Staff", icon: UserPlus, href: null, onClick: null },
    { label: "Add Menu", icon: ClipboardList, href: null, onClick: () => setShowAddMenu(true) },
    { label: "Send Notification", icon: Bell, href: "/admin/notifications", onClick: null },
  ];

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-ink">Admin Command Center</h3>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const cls = "flex flex-col items-center gap-2 rounded-xl border border-ink/10 p-4 text-center hover:border-coral hover:bg-blush";
          const content = (
            <>
              <Icon className="h-5 w-5 text-coral-dark" />
              <span className="text-xs font-medium text-ink/70">{action.label}</span>
            </>
          );
          if (action.href) {
            return (
              <Link key={action.label} href={action.href} className={cls}>
                {content}
              </Link>
            );
          }
          return (
            <button key={action.label} onClick={action.onClick ?? undefined} className={cls}>
              {content}
            </button>
          );
        })}
      </div>

      {showAddMenu && <AddMenuModal onClose={() => setShowAddMenu(false)} />}
    </div>
  );
}
