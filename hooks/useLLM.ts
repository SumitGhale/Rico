import { GEMINI_API_KEY, GEMINI_CONFIG } from "@/constants/Gemini";
import { GoogleGenAI } from "@google/genai";
import { useCallback, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  thinking?: string; // thought summary from the model's reasoning
  timestamp: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLLM() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize the GoogleGenAI client (persists across renders)
  const aiRef = useRef(new GoogleGenAI({ apiKey: GEMINI_API_KEY }));

  // Chat session ref — created lazily, reset when conversation is cleared
  const chatRef = useRef<ReturnType<typeof aiRef.current.chats.create> | null>(
    null
  );

  /**
   * Get or create a chat session.
   * Uses Gemini's built-in chat history management.
   */
  const getOrCreateChat = useCallback(() => {
    if (!chatRef.current) {
      chatRef.current = aiRef.current.chats.create({
        model: GEMINI_CONFIG.model,
        config: {
          systemInstruction: GEMINI_CONFIG.systemInstruction,
        },
      });
    }
    return chatRef.current;
  }, []);

  /**
   * Send a user message and stream the model's response.
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
        const chat = getOrCreateChat();

        // 2. Send message (non-streaming — RN fetch doesn't support ReadableStream)
        const response = await chat.sendMessage({
          message: text.trim(),
        });

        let fullText = "";
        let thoughtSummary = "";

        // Parse thinking and answer parts from the response
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (!part.text) continue;
              // This is the actual answer
              fullText += part.text;
          }
        }

        // 3. Add the complete model response to messages
        const modelMessage: Message = {
          id: `model-${Date.now()}`,
          role: "model",
          text: fullText,
          thinking: thoughtSummary || undefined,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, modelMessage]);
      } catch (err: any) {
        console.error("Gemini API error:", err);
        const errorText =
          err?.message || "Something went wrong. Please try again.";
        setError(errorText);

        // Add an error message to the chat so user sees it
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "model",
          text: `⚠️ ${errorText}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsGenerating(false);
        setThinking(null);
      }
    },
    [getOrCreateChat]
  );

  /**
   * Reset the conversation — clears messages and creates a fresh chat session.
   */
  const resetChat = useCallback(() => {
    setMessages([]);
    chatRef.current = null;
    setThinking(null);
    setError(null);
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
