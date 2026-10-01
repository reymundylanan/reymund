"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAnnouncement, safeAnnouncementLink, type Announcement } from "@/lib/supabase/queries/publicContent";

/** The gold bar above the header; text and link are set by Admin (065). */
export default function AnnouncementBar() {
  const [a, setA] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAnnouncement(createClient()).then((x) => {
      if (!cancelled) setA(x);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!a || !a.enabled || !a.text) return null;
  const link = safeAnnouncementLink(a.link);
  return (
    <div className="bg-coral px-4 py-2 text-center text-sm text-white">
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2">
        <Sparkles className="h-4 w-4" />
        {a.text}
        {link && (
          <a href={link} className="font-semibold underline underline-offset-2">
            {a.linkLabel || "Learn More"}
          </a>
        )}
      </span>
    </div>
  );
}
