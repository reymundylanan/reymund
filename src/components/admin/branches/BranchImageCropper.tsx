"use client";

import { useRef, useState } from "react";
import ReactCrop, { type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

function initCrop(): Crop {
  return { unit: "%", x: 5, y: 5, width: 90, height: 90 };
}

export default function BranchImageCropper({
  src,
  onDone,
  onCancel,
}: {
  src: string;
  onDone: (croppedDataUrl: string, croppedFile: File) => void;
  onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>(initCrop());

  async function handleConfirm() {
    const img = imgRef.current;
    if (!img || !crop) return;

    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const px = {
      x: (crop.unit === "%" ? (crop.x / 100) * img.width : crop.x) * scaleX,
      y: (crop.unit === "%" ? (crop.y / 100) * img.height : crop.y) * scaleY,
      w: (crop.unit === "%" ? (crop.width / 100) * img.width : crop.width) * scaleX,
      h: (crop.unit === "%" ? (crop.height / 100) * img.height : crop.height) * scaleY,
    };

    const canvas = document.createElement("canvas");
    canvas.width = px.w;
    canvas.height = px.h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.92));
    const file = new File([blob], "branch.jpg", { type: "image/jpeg" });
    onDone(dataUrl, file);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="mb-3 text-base font-semibold text-ink">Crop Image</h3>
        <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-xl bg-ink/5 p-2">
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} keepSelection>
            <img
              ref={imgRef}
              src={src}
              alt="branch"
              className="max-h-[55vh] max-w-full object-contain"
            />
          </ReactCrop>
        </div>
        <p className="mt-2 text-xs text-ink/40">Drag the handles to adjust the crop area.</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30">
            Cancel
          </button>
          <button onClick={handleConfirm} className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}
