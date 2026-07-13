"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  src: string;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}

const CONTAINER = 320;
const CIRCLE = 240;

export default function AvatarCropModal({ src, onDone, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setOffsetStart({ ...offset });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setOffset({
      x: offsetStart.x + e.clientX - dragStart.x,
      y: offsetStart.y + e.clientY - dragStart.y,
    });
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    setDragging(true);
    setDragStart({ x: t.clientX, y: t.clientY });
    setOffsetStart({ ...offset });
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging) return;
    const t = e.touches[0];
    setOffset({
      x: offsetStart.x + t.clientX - dragStart.x,
      y: offsetStart.y + t.clientY - dragStart.y,
    });
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale((s) => Math.min(4, Math.max(0.3, s - e.deltaY * 0.001)));
  }

  function handleDone() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const size = CIRCLE;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    const scaledW = img.naturalWidth * scale;
    const scaledH = img.naturalHeight * scale;
    const imgX = CONTAINER / 2 - scaledW / 2 + offset.x;
    const imgY = CONTAINER / 2 - scaledH / 2 + offset.y;

    const cropLeft = CONTAINER / 2 - CIRCLE / 2;
    const cropTop = CONTAINER / 2 - CIRCLE / 2;

    const srcX = (cropLeft - imgX) / scale;
    const srcY = (cropTop - imgY) / scale;
    const srcSize = CIRCLE / scale;

    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

    canvas.toBlob((blob) => { if (blob) onDone(blob); }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Crop Photo</h3>
          <button onClick={onCancel} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-center text-xs text-ink/40">Drag to reposition · Scroll or slider to zoom</p>

        <div
          className="relative mx-auto cursor-move overflow-hidden rounded-xl bg-gray-900 select-none"
          style={{ width: CONTAINER, height: CONTAINER }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={() => setDragging(false)}
          onWheel={handleWheel}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt="crop preview"
            draggable={false}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
              maxWidth: "none",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />

          {/* Dark overlay with circular cutout */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle ${CIRCLE / 2}px at center, transparent ${CIRCLE / 2}px, rgba(0,0,0,0.55) ${CIRCLE / 2}px)`,
            }}
          />

          {/* Circle border guide */}
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/80"
            style={{
              width: CIRCLE,
              height: CIRCLE,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-ink/40">−</span>
          <input
            type="range"
            min={0.3}
            max={4}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="flex-1 accent-coral"
          />
          <span className="text-xs text-ink/40">+</span>
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
          >
            Cancel
          </button>
          <button
            onClick={handleDone}
            className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
