import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ScheduleEvent } from "@/utils/parseSchedule";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emojiForType(type: ScheduleEvent["type"]): string {
  switch (type) {
    case "event":
      return "📅";
    case "task":
      return "✅";
    case "reminder":
      return "🔔";
    default:
      return "📌";
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ScheduleConfirmationProps {
  events: ScheduleEvent[];
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ScheduleConfirmation({
  events,
  onConfirm,
  onDismiss,
}: ScheduleConfirmationProps) {
  const [status, setStatus] = useState<"pending" | "added" | "dismissed">(
    "pending"
  );

  const handleConfirm = () => {
    setStatus("added");
    onConfirm();
  };

  const handleDismiss = () => {
    setStatus("dismissed");
    onDismiss();
  };

  return (
    <View
      style={{
        backgroundColor: "#f0f9ff",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        maxWidth: "90%",
        borderLeftWidth: 4,
        borderLeftColor: "#3b82f6",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Ionicons name="calendar-outline" size={18} color="#3b82f6" />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: "#1e40af",
            marginLeft: 6,
          }}
        >
          Schedule Ready
        </Text>
      </View>

      {/* Event list */}
      {events.map((evt, idx) => (
        <View
          key={idx}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginBottom: idx < events.length - 1 ? 8 : 0,
            paddingLeft: 4,
          }}
        >
          <Text style={{ fontSize: 14, marginRight: 6 }}>
            {emojiForType(evt.type)}
          </Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: "#1f2937" }}
            >
              {evt.title}
            </Text>
            <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>
              {formatDate(evt.date)} · {formatTime(evt.time)}
              {evt.duration_minutes ? ` · ${evt.duration_minutes} min` : ""}
            </Text>
          </View>
        </View>
      ))}

      {/* Action buttons or post-action status */}
      {status === "pending" ? (
        <View
          style={{
            flexDirection: "row",
            marginTop: 14,
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={handleConfirm}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#3b82f6",
              borderRadius: 10,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text
              style={{
                color: "#fff",
                fontWeight: "600",
                fontSize: 13,
                marginLeft: 5,
              }}
            >
              Add to Calendar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDismiss}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f3f4f6",
              borderRadius: 10,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="close-circle" size={16} color="#6b7280" />
            <Text
              style={{
                color: "#6b7280",
                fontWeight: "600",
                fontSize: 13,
                marginLeft: 5,
              }}
            >
              Dismiss
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 6,
          }}
        >
          <Ionicons
            name={status === "added" ? "checkmark-done" : "close"}
            size={16}
            color={status === "added" ? "#22c55e" : "#9ca3af"}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: status === "added" ? "#22c55e" : "#9ca3af",
              marginLeft: 4,
            }}
          >
            {status === "added"
              ? "Added to calendar ✅"
              : "Dismissed"}
          </Text>
        </View>
      )}
    </View>
  );
}
