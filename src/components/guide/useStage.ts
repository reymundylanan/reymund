"use client";

import { useEffect, useRef, type RefObject } from "react";
import { GUIDE_ACTIVE_EVENT, announce, type GuideActiveDetail, type ScreenRect } from "@/lib/glowEvents";

/** Calls the floating GlowSync character onto a "stage" (Services guide, Meet
 * the Team…): while `active`, it flies from its corner to `ref` and that stage's
 * mascot takes over; when inactive, it flies back. `where` changes (e.g. the
 * card the guide is on) keep the remembered position fresh for the way back. */
export function useStage(source: string, active: boolean, ref: RefObject<HTMLElement | null>, opts: { fly?: boolean; where?: unknown } = {}) {
  const { fly = true, where } = opts;
  // Last known position on the page (document coordinates), for the flight home.
  const last = useRef<ScreenRect | null>(null);

  const remember = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r && r.width > 0) last.current = { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height };
  };

  useEffect(() => {
    remember();
    const l = last.current;
    const detail: GuideActiveDetail = { source, active, rect: fly && l ? { x: l.x, y: l.y - window.scrollY, w: l.w, h: l.h } : null };
    announce(GUIDE_ACTIVE_EVENT, detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remember() only reads the ref
  }, [source, active, fly]);

  // The mascot moves (to another card): re-measure once it has settled.
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(remember, 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remember() only reads the ref
  }, [active, where]);

  useEffect(() => () => announce(GUIDE_ACTIVE_EVENT, { source, active: false, rect: null } satisfies GuideActiveDetail), [source]);
}
