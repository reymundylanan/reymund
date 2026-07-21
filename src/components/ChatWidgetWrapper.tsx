"use client";

import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import ChatWidget from "@/components/ChatWidget";

export default function ChatWidgetWrapper() {
  const { user } = useCurrentUser();
  if (user?.role !== "customer") return null;
  return <ChatWidget />;
}
