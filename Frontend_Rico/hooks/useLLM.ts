import { BACKEND_URL } from "@/constants/Gemini";
import { getAuthHeaders, handleUnauthorizedToken } from "@/services/authService";
import type {
  ScheduleDelete,
  ScheduleEvent,
  ScheduleUpdate,
} from "@/utils/parseSchedule";
import { fetch as expoFetch } from "expo/fetch";
import { useCallback, useEffect, useRef, useState } from "react";

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

interface UseLLMOptions {
  onAudioStreamStart?: () => void;
  onAudioChunk?: (sequence: number, audioContent: string) => void;
  onAudioStreamComplete?: (audioChunkCount: number) => void;
  onAudioStreamCancel?: () => void;
}

type StreamEvent =
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "audio_chunk";
      sequence: number;
      audioContent: string;
    }
  | {
      type: "final";
      conversationId: string;
      userMessage: Message;
      modelMessage: Omit<Message, "role">;
      audioChunkCount?: number;
      text: string;
    }
  | {
      type: "error";
      message: string;
    };

export function useLLM(options: UseLLMOptions = {}) {
  const {
    onAudioStreamStart,
    onAudioChunk,
    onAudioStreamComplete,
    onAudioStreamCancel,
  } = options;
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
    setThinking(null);
    onAudioStreamCancel?.();
  }, [onAudioStreamCancel]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText) return;

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const requestTimestamp = Date.now();
      const streamingMessageId = `model-stream-${requestTimestamp}`;
      const userMessage: Message = {
        id: `user-${requestTimestamp}`,
        role: "user",
        text: trimmedText,
        timestamp: requestTimestamp,
      };

      setMessages((previous) => [...previous, userMessage]);
      setIsGenerating(true);
      setThinking(null);
      setError(null);
      onAudioStreamStart?.();

      const appendModelText = (textDelta: string) => {
        setMessages((previous) => {
          const existingIndex = previous.findIndex(
            (message) => message.id === streamingMessageId
          );

          if (existingIndex === -1) {
            return [
              ...previous,
              {
                id: streamingMessageId,
                role: "model",
                text: textDelta,
                timestamp: Date.now(),
              },
            ];
          }

          return previous.map((message, index) =>
            index === existingIndex
              ? { ...message, text: message.text + textDelta }
              : message
          );
        });
      };

      let receivedFinalEvent = false;

      try {
        const authHeaders = await getAuthHeaders();
        const response = await expoFetch(`${BACKEND_URL}/api/chat/stream`, {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: trimmedText,
            conversationId,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          if (response.status === 401) await handleUnauthorizedToken();
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Server error (${response.status})`
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pendingLines = "";

        const handleEvent = (event: StreamEvent) => {
          switch (event.type) {
            case "text_delta":
              appendModelText(event.text);
              break;

            case "audio_chunk":
              onAudioChunk?.(event.sequence, event.audioContent);
              break;

            case "final": {
              receivedFinalEvent = true;
              setConversationId(event.conversationId);
              onAudioStreamComplete?.(event.audioChunkCount ?? 0);

              const finalMessage: Message = {
                ...event.modelMessage,
                role: "model",
              };

              setMessages((previous) => {
                const existingIndex = previous.findIndex(
                  (message) => message.id === streamingMessageId
                );

                if (existingIndex === -1) {
                  return [...previous, finalMessage];
                }

                return previous.map((message, index) =>
                  index === existingIndex ? finalMessage : message
                );
              });
              break;
            }

            case "error":
              throw new Error(event.message);
          }
        };

        const processCompleteLines = () => {
          const lines = pendingLines.split("\n");
          pendingLines = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            handleEvent(JSON.parse(line) as StreamEvent);
          }
        };

        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            pendingLines += decoder.decode();
            break;
          }

          pendingLines += decoder.decode(value, { stream: true });
          processCompleteLines();
        }

        if (pendingLines.trim()) {
          handleEvent(JSON.parse(pendingLines) as StreamEvent);
        }

        if (!receivedFinalEvent) {
          throw new Error("The response stream ended before completion");
        }
      } catch (streamError: any) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("Backend streaming API error:", streamError);
        setError(
          streamError?.message || "Something went wrong. Please try again."
        );
        onAudioStreamCancel?.();
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        setIsGenerating(false);
        setThinking(null);
      }
    },
    [
      conversationId,
      onAudioChunk,
      onAudioStreamCancel,
      onAudioStreamComplete,
      onAudioStreamStart,
    ]
  );

  const resetChat = useCallback(async () => {
    cancelGeneration();
    setMessages([]);
    setThinking(null);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${BACKEND_URL}/api/chat/reset`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        if (response.status === 401) await handleUnauthorizedToken();
        throw new Error(`Server error (${response.status})`);
      }
      const data = await response.json();
      setConversationId(data.conversationId);
    } catch (resetError) {
      console.warn("Failed to reset backend chat session:", resetError);
      setConversationId(null);
    }
  }, [cancelGeneration]);

  return {
    sendMessage,
    messages,
    isGenerating,
    thinking,
    error,
    resetChat,
    cancelGeneration,
  };
}
