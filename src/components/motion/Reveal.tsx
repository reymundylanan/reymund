"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Eases its content up into view the first time it scrolls on screen
 * (`.reveal` in globals.css). Without JavaScript, or with reduced motion,
 * the content is simply shown. */
export default function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${shown ? "is-in" : ""} ${className}`}>
      {children}
    </div>
  );
}
