import { BACKEND_URL } from "@/constants/Gemini";
import { getAuthHeaders } from "@/services/authService";
import { useCallback, useState } from "react";
import type { ScheduleEvent, ScheduleUpdate, ScheduleDelete } from "@/utils/parseSchedule";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  thinking?: string;
  scheduleEvents?: ScheduleEvent[];
  scheduleUpdates?: ScheduleUpdate[];
  scheduleDeletes?: ScheduleDelete[];
  audioContent?: string;
  timestamp: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLLM() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Send a user message via the Express backend.
   * Updates `messages`, `isGenerating`, and `thinking` state reactively.
   */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError(null);

      // 1. Append the user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        text: text.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsGenerating(true);
      setThinking(null);

      try {
        // 2. Call the Express backend
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`${BACKEND_URL}/api/chat`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            conversationId,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Server error (${res.status})`
          );
        }

        const data = await res.json();
        setConversationId(data.conversationId);

        // 3. Add the complete model response to messages
        const modelMessage: Message = {
          ...data.modelMessage,
          role: "model",
        };
        setMessages((prev) => [...prev, modelMessage]);
      } catch (err: any) {
        console.error("Backend API error:", err);
        const errorText =
          err?.message || "Something went wrong. Please try again.";
        setError(errorText);
      } finally {
        setIsGenerating(false);
        setThinking(null);
      }
    },
    [conversationId]
  );

  /**
   * Reset the conversation — clears local messages and tells the backend
   * to destroy its chat session so the next message starts fresh.
   */
  const resetChat = useCallback(async () => {
    setMessages([]);
    setThinking(null);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${BACKEND_URL}/api/chat/reset`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        throw new Error(`Server error (${res.status})`);
      }
      const data = await res.json();
      setConversationId(data.conversationId);
    } catch (err) {
      console.warn("Failed to reset backend chat session:", err);
      setConversationId(null);
    }
  }, []);

  return {
    sendMessage,
    messages,
    isGenerating,
    thinking,
    error,
    resetChat,
  };
}
