"use client";

import { useEffect, useState } from "react";
import { Trash2, Upload, X } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Branch = { id: string; name: string };
type MenuPhoto = { id: string; image_url: string; storage_path: string };

export default function AddMenuModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [photos, setPhotos] = useState<MenuPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("branches")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        const rows = (data as Branch[]) ?? [];
        setBranches(rows);
        if (rows[0]) setBranchId(rows[0].id);
      });
  }, [supabase]);

  useEffect(() => {
    if (!branchId) return;
    loadPhotos(branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  async function loadPhotos(forBranchId: string) {
    const { data, error: loadError } = await supabase
      .from("branch_gallery")
      .select("id, image_url, storage_path")
      .eq("branch_id", forBranchId)
      .eq("category", "menu")
      .order("created_at", { ascending: false });
    if (loadError) console.error("[add-menu] load error:", loadError.message);
    setPhotos((data as MenuPhoto[]) ?? []);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !branchId) return;
    setUploading(true);
    setError(null);
    let failed = 0;

    for (const file of Array.from(files)) {
      const storagePath = `${branchId}/menu-${Date.now()}-${file.name}`;
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
        branch_id: branchId,
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
    e.target.value = "";
    loadPhotos(branchId);
  }

  async function handleDelete(photo: MenuPhoto) {
    await supabase.storage.from("branch-gallery").remove([photo.storage_path]);
    await supabase.from("branch_gallery").delete().eq("id", photo.id);
    loadPhotos(branchId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Add Menu</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-ink">Branch</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm text-ink outline-none focus:border-coral"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload Menu Photo"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading || !branchId}
            onChange={handleUpload}
            className="hidden"
          />
        </label>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-4 grid grid-cols-3 gap-3">
          {photos.length === 0 && (
            <p className="col-span-3 py-6 text-center text-sm text-ink/40">
              No menu photos uploaded yet for this branch.
            </p>
          )}
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl">
              <Image
                src={p.image_url}
                alt="Menu photo"
                fill
                className="object-cover"
                sizes="150px"
              />
              <button
                onClick={() => handleDelete(p)}
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
  );
}
