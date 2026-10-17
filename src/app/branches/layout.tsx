import type { ReactNode } from "react";

// The Branches page itself runs in the browser, so its title lives here.
export const metadata = {
  title: { default: "Our Branches", template: "%s | Blush Spa & Aesthetics" },
  description: "Visit Blush Spa & Aesthetics in Pagadian City — One Cecilia Center and Robinsons Pagadian. Opening hours, directions and what's open now.",
  alternates: { canonical: "/branches" },
};

export default function BranchesLayout({ children }: { children: ReactNode }) {
  return children;
}
