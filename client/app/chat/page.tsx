import type { Metadata } from "next";
import { Chat } from "@/components/chat";

export const metadata: Metadata = {
  title: "Chat · EquityIQ",
  description: "Ask about a stock in a chat and choose which research tools to use.",
};

export default function ChatPage() {
  return <Chat />;
}
