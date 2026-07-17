import Link from "next/link";
import { Building2, PackageSearch, UserPlus } from "lucide-react";

const actions = [
  { label: "Add Branch", icon: Building2, href: "/admin/branches" },
  { label: "Manage Staff", icon: UserPlus, href: null },
  { label: "Inventory Check", icon: PackageSearch, href: null },
];

export default function CommandCenter() {
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
          return action.href ? (
            <Link key={action.label} href={action.href} className={cls}>{content}</Link>
          ) : (
            <button key={action.label} className={cls}>{content}</button>
          );
        })}
      </div>
    </div>
  );
}
