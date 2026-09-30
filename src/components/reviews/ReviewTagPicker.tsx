"use client";

import { tagsForService } from "@/lib/reviewRewards";

export const MAX_REVIEW_TAGS = 6;

export default function ReviewTagPicker({
  serviceName,
  selected,
  onChange,
  readOnly = false,
  disabled = false,
}: {
  serviceName: string;
  selected: string[];
  onChange?: (tags: string[]) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  if (readOnly) {
    if (selected.length === 0) return null;
    return (
      <ul className="flex flex-wrap gap-1.5" aria-label={`Tags for ${serviceName}`}>
        {selected.map((tag) => (
          <li key={tag} className="rounded-full bg-coral px-3 py-1 text-xs font-medium text-white">
            {tag}
          </li>
        ))}
      </ul>
    );
  }

  const full = selected.length >= MAX_REVIEW_TAGS;
  return (
    <div role="group" aria-label={`Tags for ${serviceName}`} className="flex flex-wrap gap-1.5">
      {tagsForService(serviceName).map((tag) => {
        const on = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            disabled={disabled || (!on && full)}
            onClick={() => onChange?.(on ? selected.filter((t) => t !== tag) : [...selected, tag])}
            className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
              on ? "bg-coral text-white" : "border border-ink/15 text-ink/70 hover:border-ink/30"
            }`}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
