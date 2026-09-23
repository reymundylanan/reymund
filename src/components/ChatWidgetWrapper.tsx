"use client";

import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import ChatWidget from "@/components/ChatWidget";

export default function ChatWidgetWrapper() {
  const { user } = useCurrentUser();
  const pathname = usePathname();
  if (user?.role !== "customer") return null;
  // My Glow already has its own inline AssistantPanel — avoid showing two
  // separate chat conversations on the same page.
  if (pathname?.startsWith("/my-glow")) return null;
  return <ChatWidget />;
}
