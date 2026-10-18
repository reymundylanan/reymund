import type { MetadataRoute } from "next";

// Lets clients "Add to Home Screen" — iPhones only allow push
// notifications for sites added that way.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GlowSync — Blush Spa & Aesthetics",
    short_name: "GlowSync",
    description: "Book and manage your Blush Spa & Aesthetics appointments.",
    start_url: "/my-glow",
    display: "standalone",
    background_color: "#FBF6E8",
    theme_color: "#C9A84A",
    icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" }],
  };
}
