import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a Cloudflare quick tunnel (used to test Messenger
  // webhooks locally) load the dev server's assets.
  allowedDevOrigins: ["*.trycloudflare.com"],
  images: {
    // 90 for the large service photos, which looked muddy at the default 75.
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zxcgdirwkzdiufmhstau.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "zxcgdirwkzdiufmhstau.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
  async headers() {
    return [
      {
        // Push notifications: browsers must always fetch the newest worker.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
