"use client";

/**
 * An inline script that runs while the first HTML is parsed (before React
 * hydrates). The browser renders it as JavaScript from the server HTML; in the
 * browser React sees `text/plain`, so it doesn't warn about rendering a
 * <script> (see Next's "Preventing flash before hydration" guide).
 */
export default function InlineScript({ id, html }: { id?: string; html: string }) {
  return (
    <script
      id={id}
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
