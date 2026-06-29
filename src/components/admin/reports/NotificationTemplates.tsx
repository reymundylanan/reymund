"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { notificationTemplates } from "@/lib/adminData";

export default function NotificationTemplates() {
  const [editing, setEditing] = useState<(typeof notificationTemplates)[number] | null>(
    null
  );

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Notification Templates</h2>
      <div className="mt-4 space-y-3">
        {notificationTemplates.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-xl border border-ink/10 p-4"
          >
            <span className="font-medium text-ink">{t.name}</span>
            <button
              onClick={() => setEditing(t)}
              className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-coral"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit Template
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">{editing.name}</h3>
              <button onClick={() => setEditing(null)} className="text-ink/40 hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              defaultValue={`Hi {{client_name}}, this is a confirmation for your ${editing.name.toLowerCase()}.`}
              rows={5}
              className="mt-4 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
              >
                Cancel
              </button>
              <button className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
