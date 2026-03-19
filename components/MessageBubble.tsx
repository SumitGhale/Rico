import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Message } from "@/hooks/useLLM";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [showThinking, setShowThinking] = useState(false);
  const isError = message.text.startsWith("⚠️");

  return (
    <View
      style={{
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
        paddingHorizontal: 4,
      }}
    >
      {/* Thinking toggle (only for model messages with thought summaries) */}
      {!isUser && message.thinking && (
        <TouchableOpacity
          onPress={() => setShowThinking(!showThinking)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 4,
            paddingHorizontal: 4,
          }}
        >
          <Ionicons
            name="bulb-outline"
            size={14}
            color="#a78bfa"
          />
          <Text
            style={{
              fontSize: 12,
              color: "#a78bfa",
              marginLeft: 4,
              fontWeight: "500",
            }}
          >
            {showThinking ? "Hide thinking" : "Show thinking"}
          </Text>
          <Ionicons
            name={showThinking ? "chevron-up" : "chevron-down"}
            size={12}
            color="#a78bfa"
            style={{ marginLeft: 2 }}
          />
        </TouchableOpacity>
      )}

      {/* Thought summary (collapsible) */}
      {showThinking && message.thinking && (
        <View
          style={{
            backgroundColor: "#f5f3ff",
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            marginBottom: 4,
            maxWidth: "85%",
            borderLeftWidth: 3,
            borderLeftColor: "#a78bfa",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: "#6d28d9",
              lineHeight: 18,
              fontStyle: "italic",
            }}
          >
            {message.thinking}
          </Text>
        </View>
      )}

      {/* Message bubble */}
      <View
        style={{
          backgroundColor: isUser
            ? "#3b82f6"
            : isError
              ? "#fef2f2"
              : "#f3f4f6",
          borderRadius: 20,
          borderBottomRightRadius: isUser ? 6 : 20,
          borderBottomLeftRadius: isUser ? 20 : 6,
          paddingHorizontal: 16,
          paddingVertical: 10,
          maxWidth: "80%",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 1,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            lineHeight: 22,
            color: isUser ? "#ffffff" : isError ? "#b91c1c" : "#1f2937",
          }}
          selectable
        >
          {message.text}
        </Text>
      </View>

      {/* Timestamp */}
      <Text
        style={{
          fontSize: 10,
          color: "#9ca3af",
          marginTop: 4,
          paddingHorizontal: 4,
        }}
      >
        {new Date(message.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );
}
