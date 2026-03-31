import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ScheduleUpdate } from "@/utils/parseSchedule";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

interface UpdateConfirmationProps {
  updates: ScheduleUpdate[];
  onConfirm: () => void;
  onDismiss: () => void;
}

export function UpdateConfirmation({
  updates,
  onConfirm,
  onDismiss,
}: UpdateConfirmationProps) {
  const [status, setStatus] = useState<"pending" | "updated" | "dismissed">(
    "pending"
  );

  const handleConfirm = () => {
    setStatus("updated");
    onConfirm();
  };

  const handleDismiss = () => {
    setStatus("dismissed");
    onDismiss();
  };

  return (
    <View
      style={{
        backgroundColor: "#fffbeb",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        maxWidth: "90%",
        borderLeftWidth: 4,
        borderLeftColor: "#f59e0b",
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
        <Ionicons name="create-outline" size={18} color="#f59e0b" />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: "#92400e",
            marginLeft: 6,
          }}
        >
          Schedule Update
        </Text>
      </View>

      {/* Update list */}
      {updates.map((upd, idx) => (
        <View
          key={upd.id}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginBottom: idx < updates.length - 1 ? 8 : 0,
            paddingLeft: 4,
          }}
        >
          <Text style={{ fontSize: 14, marginRight: 6 }}>📝</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: "#1f2937" }}
            >
              {upd.title}
            </Text>
            <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>
              → {formatDate(upd.date)} · {formatTime(upd.time)}
              {upd.duration_minutes ? ` · ${upd.duration_minutes} min` : ""}
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
              backgroundColor: "#f59e0b",
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
              Update Calendar
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
            name={status === "updated" ? "checkmark-done" : "close"}
            size={16}
            color={status === "updated" ? "#22c55e" : "#9ca3af"}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: status === "updated" ? "#22c55e" : "#9ca3af",
              marginLeft: 4,
            }}
          >
            {status === "updated"
              ? "Calendar updated ✅"
              : "Dismissed"}
          </Text>
        </View>
      )}
    </View>
  );
}
