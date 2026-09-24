"use client";

import { useEffect, useState } from "react";
import { Trash2, Upload, X } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type MenuPhoto = { id: string; image_url: string; storage_path: string };

export default function AddMenuModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<MenuPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  async function loadPhotos() {
    const { data, error: loadError } = await supabase
      .from("branch_gallery")
      .select("id, image_url, storage_path")
      .is("branch_id", null)
      .eq("category", "menu")
      .order("created_at", { ascending: false });
    if (loadError) console.error("[add-menu] load error:", loadError.message);
    setPhotos((data as MenuPhoto[]) ?? []);
  }

  useEffect(() => {
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    setPendingFiles(fileArr);
    setPendingPreviews(fileArr.map((f) => URL.createObjectURL(f)));
    setError(null);
    e.target.value = "";
  }

  function cancelPending() {
    pendingPreviews.forEach((url) => URL.revokeObjectURL(url));
    setPendingFiles([]);
    setPendingPreviews([]);
  }

  async function confirmUpload() {
    setUploading(true);
    setError(null);
    let failed = 0;

    for (const file of pendingFiles) {
      const storagePath = `shared-menu/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("branch-gallery")
        .upload(storagePath, file, { upsert: false });
      if (uploadErr) {
        console.error("[add-menu] upload error:", uploadErr.message);
        failed++;
        continue;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("branch-gallery").getPublicUrl(storagePath);
      const { error: dbErr } = await supabase.from("branch_gallery").insert({
        branch_id: null,
        storage_path: storagePath,
        image_url: publicUrl,
        category: "menu",
      });
      if (dbErr) {
        console.error("[add-menu] db insert error:", dbErr.message);
        failed++;
      }
    }

    if (failed > 0) setError(`${failed} file(s) failed to upload.`);
    setUploading(false);
    cancelPending();
    loadPhotos();
  }

  async function handleDelete(photo: MenuPhoto) {
    await supabase.storage.from("branch-gallery").remove([photo.storage_path]);
    await supabase.from("branch_gallery").delete().eq("id", photo.id);
    loadPhotos();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="scrollbar-hidden max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Add Menu</h2>
            <button onClick={onClose} className="text-ink/40 hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>

          {pendingFiles.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-coral/40 p-4">
              <p className="text-sm font-medium text-ink">
                Upload {pendingFiles.length} photo{pendingFiles.length > 1 ? "s" : ""}?
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {pendingPreviews.map((url, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Selected preview" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={confirmUpload}
                  disabled={uploading}
                  className="flex-1 rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "Yes, Upload"}
                </button>
                <button
                  onClick={cancelPending}
                  disabled={uploading}
                  className="flex-1 rounded-full border border-ink/15 py-2 text-sm font-medium text-ink/70 hover:border-coral disabled:opacity-50"
                >
                  No, Cancel
                </button>
              </div>
            </div>
          ) : (
            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
              <Upload className="h-4 w-4" />
              Select Menu Photo
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleSelectFiles}
                className="hidden"
              />
            </label>
          )}
          {photos.length > 0 && (
            <p className="mt-2 text-center text-base text-ink/50">
              {photos.length} photo{photos.length > 1 ? "s" : ""} uploaded
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <div className="mt-4 grid grid-cols-3 gap-3">
            {photos.length === 0 && (
              <p className="col-span-3 py-6 text-center text-sm text-ink/40">
                No menu photos uploaded yet.
              </p>
            )}
            {photos.map((p) => (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl">
                <button
                  onClick={() => setLightboxUrl(p.image_url)}
                  className="absolute inset-0"
                  aria-label="View menu photo"
                >
                  <Image
                    src={p.image_url}
                    alt="Menu photo"
                    fill
                    className="object-cover"
                    sizes="150px"
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(p);
                  }}
                  aria-label="Delete menu photo"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative h-[85vh] w-[85vw] max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxUrl(null)}
              aria-label="Close preview"
              className="absolute -right-3 -top-3 z-10 rounded-full bg-white p-1.5 text-ink shadow-lg hover:bg-blush"
            >
              <X className="h-5 w-5" />
            </button>
            <Image
              src={lightboxUrl}
              alt="Menu photo full size"
              fill
              className="object-contain"
              sizes="85vw"
            />
          </div>
        </div>
      )}
    </>
  );
}
