"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type DragItem = { kind: "staff" | "appointment" | "client" | "promo" | "service"; id: string };
type Ghost = { item: DragItem; x: number; y: number; w: number; ox: number; oy: number };
/** Where in the column the card would land: y of the card's top edge, from the column's top. */
export type DropPoint = { key: string; top: number };

/** Pointer-based drag (mouse, pen, finger) between board columns. Fingers drag
 * from a `[data-grip]` so the board still scrolls; a mouse drags the card.
 * Near the scroller's edges the board scrolls sideways while dragging.
 * Esc cancels a drag; dropping a card back on its own column does nothing
 * (unless `sameColumn`, where the drop point matters — the day timeline). */
export function useCardDrag(onDrop: (item: DragItem, columnKey: string, at: DropPoint) => void, opts: { sameColumn?: boolean } = {}) {
  const columns = useRef(new Map<string, HTMLElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const pending = useRef<{ item: DragItem; x: number; y: number; el: HTMLElement; started: boolean; from: string | null } | null>(null);
  // The click that ends a drag must not also open the card.
  const justDragged = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [overPoint, setOverPoint] = useState<DropPoint | null>(null);
  const grabY = useRef(0);

  const columnAt = (x: number, y: number) => {
    for (const [key, el] of columns.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
    }
    return null;
  };
  const pointIn = (key: string | null, y: number): DropPoint | null => {
    const el = key ? columns.current.get(key) : null;
    return key && el ? { key, top: y - grabY.current - el.getBoundingClientRect().top } : null;
  };
  const track = (x: number, y: number) => {
    const key = columnAt(x, y);
    setOver(key);
    setOverPoint(pointIn(key, y));
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
        track(x, y);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      pending.current = null;
      justDragged.current = true;
      setGhost(null);
      setOver(null);
      setOverPoint(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- track only reads refs and setters
  }, [dragging]);

  function cardProps(item: DragItem, enabled = true) {
    if (!enabled) return {};
    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        justDragged.current = false;
        const target = e.target as HTMLElement;
        // Controls inside a card keep working (the card itself may be a button).
        const control = target.closest("button, select, a, input, label");
        if (control && control !== e.currentTarget) return;
        if (e.pointerType === "touch" && !target.closest("[data-grip]")) return;
        pending.current = { item, x: e.clientX, y: e.clientY, el: e.currentTarget, started: false, from: columnAt(e.clientX, e.clientY) };
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
          grabY.current = p.y - r.top;
          setGhost({ item: p.item, x: e.clientX, y: e.clientY, w: r.width, ox: p.x - r.left, oy: p.y - r.top });
        }
        setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
        track(e.clientX, e.clientY);
      },
      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        const p = pending.current;
        pending.current = null;
        if (!p?.started) return;
        const to = columnAt(e.clientX, e.clientY);
        const at = pointIn(to, e.clientY);
        setGhost(null);
        setOver(null);
        setOverPoint(null);
        justDragged.current = true;
        if (to === p.from && !opts.sameColumn) return;
        if (to && at) onDrop(p.item, to, at);
      },
      // Photos inside a card would start the browser's own image drag and cancel ours.
      onDragStart(e: React.DragEvent) {
        e.preventDefault();
      },
      onClickCapture(e: React.MouseEvent) {
        if (!justDragged.current) return;
        justDragged.current = false;
        e.stopPropagation();
        e.preventDefault();
      },
      onPointerCancel() {
        pending.current = null;
        setGhost(null);
        setOver(null);
        setOverPoint(null);
      },
    };
  }

  const columnRef = (key: string) => (el: HTMLElement | null) => {
    if (el) columns.current.set(key, el);
    else columns.current.delete(key);
  };

  return { ghost, over, overPoint, scroller, cardProps, columnRef, dragging: ghost?.item ?? null };
}
