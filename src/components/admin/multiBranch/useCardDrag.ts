"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type DragItem = { kind: "staff" | "appointment"; id: string };
type Ghost = { item: DragItem; x: number; y: number; w: number; ox: number; oy: number };

/** Pointer-based drag (mouse, pen, finger) between board columns. Fingers drag
 * from a `[data-grip]` so the board still scrolls; a mouse drags the card.
 * Near the scroller's edges the board scrolls sideways while dragging. */
export function useCardDrag(onDrop: (item: DragItem, columnKey: string) => void) {
  const columns = useRef(new Map<string, HTMLElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const pending = useRef<{ item: DragItem; x: number; y: number; el: HTMLElement; started: boolean } | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const columnAt = (x: number, y: number) => {
    for (const [key, el] of columns.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
    }
    return null;
  };

  const dragging = !!ghost;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const tick = () => {
      const el = scroller.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const { x, y } = pointer.current;
        const edge = 72;
        if (x < r.left + edge) el.scrollLeft -= Math.ceil((r.left + edge - x) / 6);
        else if (x > r.right - edge) el.scrollLeft += Math.ceil((x - (r.right - edge)) / 6);
        setOver(columnAt(x, y));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  function cardProps(item: DragItem, enabled = true) {
    if (!enabled) return {};
    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("button, select, a, input, label")) return;
        if (e.pointerType === "touch" && !target.closest("[data-grip]")) return;
        pending.current = { item, x: e.clientX, y: e.clientY, el: e.currentTarget, started: false };
        pointer.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        const p = pending.current;
        if (!p) return;
        pointer.current = { x: e.clientX, y: e.clientY };
        if (!p.started) {
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
          p.started = true;
          const r = p.el.getBoundingClientRect();
          setGhost({ item: p.item, x: e.clientX, y: e.clientY, w: r.width, ox: p.x - r.left, oy: p.y - r.top });
        }
        setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
        setOver(columnAt(e.clientX, e.clientY));
      },
      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        const p = pending.current;
        pending.current = null;
        if (!p?.started) return;
        const to = columnAt(e.clientX, e.clientY);
        setGhost(null);
        setOver(null);
        if (to) onDrop(p.item, to);
      },
      onPointerCancel() {
        pending.current = null;
        setGhost(null);
        setOver(null);
      },
    };
  }

  const columnRef = (key: string) => (el: HTMLElement | null) => {
    if (el) columns.current.set(key, el);
    else columns.current.delete(key);
  };

  return { ghost, over, scroller, cardProps, columnRef, dragging: ghost?.item ?? null };
}
