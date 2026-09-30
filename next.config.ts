import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a Cloudflare quick tunnel (used to test Messenger
  // webhooks locally) load the dev server's assets.
  allowedDevOrigins: ["*.trycloudflare.com"],
  images: {
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
};

export default nextConfig;
