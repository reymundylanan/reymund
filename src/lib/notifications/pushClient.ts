import type { SupabaseClient } from "@supabase/supabase-js";

// Browser-side push helpers for the Notifications card on My Profile.

export type PushSupport = "supported" | "needs_home_screen" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "needs_home_screen";
  return hasApis ? "supported" : "unsupported";
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

/** Asks permission, subscribes this device and saves it. Returns an error message or null. */
export async function enablePush(supabase: SupabaseClient): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "Phone notifications aren't set up yet.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return "Notifications are blocked. Allow them for this site in your browser settings, then try again.";
  }
  await registration();
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const json = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_user_agent: navigator.userAgent,
  });
  if (error) {
    console.error("save_push_subscription failed:", error);
    return "Couldn't turn on notifications. Please try again.";
  }
  return null;
}

export async function disablePush(supabase: SupabaseClient): Promise<string | null> {
  const sub = await currentPushSubscription();
  if (!sub) return null;
  const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
  if (error) {
    console.error("remove_push_subscription failed:", error);
    return "Couldn't turn off notifications. Please try again.";
  }
  await sub.unsubscribe();
  return null;
}
