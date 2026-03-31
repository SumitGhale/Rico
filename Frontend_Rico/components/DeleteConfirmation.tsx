import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ScheduleDelete } from "@/utils/parseSchedule";

// ─── Component ───────────────────────────────────────────────────────────────

interface DeleteConfirmationProps {
  deletes: ScheduleDelete[];
  onConfirm: () => void;
  onDismiss: () => void;
}

export function DeleteConfirmation({
  deletes,
  onConfirm,
  onDismiss,
}: DeleteConfirmationProps) {
  const [status, setStatus] = useState<"pending" | "deleted" | "dismissed">(
    "pending"
  );

  const handleConfirm = () => {
    setStatus("deleted");
    onConfirm();
  };

  const handleDismiss = () => {
    setStatus("dismissed");
    onDismiss();
  };

  return (
    <View
      style={{
        backgroundColor: "#fef2f2",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        maxWidth: "90%",
        borderLeftWidth: 4,
        borderLeftColor: "#ef4444",
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
        <Ionicons name="trash-outline" size={18} color="#ef4444" />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: "#991b1b",
            marginLeft: 6,
          }}
        >
          Remove from Calendar
        </Text>
      </View>

      {/* Delete list */}
      {deletes.map((del, idx) => (
        <View
          key={del.id}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginBottom: idx < deletes.length - 1 ? 8 : 0,
            paddingLeft: 4,
          }}
        >
          <Text style={{ fontSize: 14, marginRight: 6 }}>🗑️</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: "#1f2937" }}
            >
              {del.title}
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
              backgroundColor: "#ef4444",
              borderRadius: 10,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="trash" size={16} color="#fff" />
            <Text
              style={{
                color: "#fff",
                fontWeight: "600",
                fontSize: 13,
                marginLeft: 5,
              }}
            >
              Remove
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
              Keep
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
            name={status === "deleted" ? "checkmark-done" : "close"}
            size={16}
            color={status === "deleted" ? "#22c55e" : "#9ca3af"}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: status === "deleted" ? "#22c55e" : "#9ca3af",
              marginLeft: 4,
            }}
          >
            {status === "deleted"
              ? "Removed from calendar ✅"
              : "Kept"}
          </Text>
        </View>
      )}
    </View>
  );
}
