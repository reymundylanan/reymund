import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { PROFILE_MESSAGES, profileErrorField, type ProfileField, type ProfileForm } from "@/lib/profileValidation";

export const PROFILE_UPDATED_EVENT = "glowsync:profile-updated";

export type MyProfile = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  address: string | null;
  avatarUrl: string | null;
};

export async function getMyProfile(supabase: SupabaseClient, userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, gender, address, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  logQueryError("getMyProfile", error);
  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    phone: data.phone,
    gender: data.gender ?? null,
    address: data.address ?? null,
    avatarUrl: data.avatar_url,
  };
}

/** null on success; otherwise the field (if the server named one) and a message. */
export async function updateMyProfile(
  supabase: SupabaseClient,
  form: ProfileForm
): Promise<{ field: ProfileField | null; message: string } | null> {
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: form.fullName,
    p_phone: form.phone,
    p_gender: form.gender,
    p_address: form.address,
  });
  if (!error) return null;
  const field = profileErrorField(error.message);
  if (!field) logQueryError("updateMyProfile", error);
  return { field, message: field ? PROFILE_MESSAGES[field] : PROFILE_MESSAGES.generic };
}

function ownObjectPath(url: string | null, userId: string): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/avatars/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length);
  return path.startsWith(`clients/${userId}/`) ? path : null;
}

export async function uploadMyAvatar(
  supabase: SupabaseClient,
  userId: string,
  blob: Blob,
  oldUrl: string | null
): Promise<{ url?: string; error?: string }> {
  const path = `clients/${userId}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
  if (upErr) {
    logQueryError("uploadMyAvatar", upErr as { message?: string });
    return { error: PROFILE_MESSAGES.upload };
  }
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.rpc("set_my_avatar", { p_url: url });
  if (error) {
    logQueryError("set_my_avatar", error);
    await supabase.storage.from("avatars").remove([path]);
    return { error: PROFILE_MESSAGES.upload };
  }
  const oldPath = ownObjectPath(oldUrl, userId);
  if (oldPath) await supabase.storage.from("avatars").remove([oldPath]);
  return { url };
}

export async function removeMyAvatar(supabase: SupabaseClient, userId: string, oldUrl: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("remove_my_avatar");
  if (error) {
    logQueryError("remove_my_avatar", error);
    return PROFILE_MESSAGES.generic;
  }
  const oldPath = ownObjectPath(oldUrl, userId);
  if (oldPath) await supabase.storage.from("avatars").remove([oldPath]);
  return null;
}
