"use client";

import { Star } from "lucide-react";

const LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

/** 5-star control. Read-only (disabled buttons) when no `onChange`. */
export default function StarInput({
  value,
  onChange,
  size = "md",
  showLabel = true,
  label,
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: "sm" | "md";
  showLabel?: boolean;
  /** Accessible name for the star group. */
  label?: string;
}) {
  const icon = size === "sm" ? "h-4 w-4" : "h-7 w-7";
  return (
    <div>
      <div className="flex gap-0.5" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={n <= value}
            className={onChange ? "cursor-pointer rounded" : "cursor-default"}
          >
            <Star className={`${icon} ${n <= value ? "fill-gold text-gold" : "text-ink/20"}`} />
          </button>
        ))}
      </div>
      {showLabel && value > 0 && size === "md" && (
        <p className="mt-0.5 text-xs font-medium text-ink/60">{LABELS[value - 1]}</p>
      )}
    </div>
  );
}
