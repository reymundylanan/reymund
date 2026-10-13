"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";

/** Date + live time chips for the Admin Dashboard header (rendered after
 * mount so server and browser clocks can't mismatch). */
export default function DateTimeChips({ variant = "plain" }: { variant?: "plain" | "glass" }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (!now) return null;
  const chip =
    variant === "glass"
      ? "flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur [&>svg]:text-champagne"
      : "flex items-center gap-2 rounded-full border border-nude bg-white px-4 py-2 text-sm text-ink/70 shadow-sm";
  return (
    <div className="flex flex-wrap gap-2">
      <span className={chip}>
        <CalendarDays className="h-4 w-4 text-coral-dark" />
        {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </span>
      <span className={chip}>
        <Clock className="h-4 w-4 text-coral-dark" />
        {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}
