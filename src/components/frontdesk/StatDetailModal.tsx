"use client";

import { X } from "lucide-react";

export type StatDetailItem = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeStyle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function StatDetailModal({
  title,
  items,
  emptyLabel,
  onClose,
}: {
  title: string;
  items: StatDetailItem[];
  emptyLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink/40">{emptyLabel}</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                  {item.subtitle && <p className="truncate text-xs text-ink/50">{item.subtitle}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.badge && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.badgeStyle ?? "bg-blush text-ink/60"}`}>
                      {item.badge}
                    </span>
                  )}
                  {item.actionLabel && item.onAction && (
                    <button
                      onClick={item.onAction}
                      className="rounded-full bg-coral px-2.5 py-1 text-xs font-semibold text-white hover:bg-coral-dark"
                    >
                      {item.actionLabel}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
