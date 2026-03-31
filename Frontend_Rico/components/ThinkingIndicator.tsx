import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ThinkingIndicatorProps {
  thinking?: string | null; // optional streamed thought summary
}

export function ThinkingIndicator({ thinking }: ThinkingIndicatorProps) {
  // Animated values for the pulsing dots
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ])
      );

    const anim1 = createDotAnimation(dot1, 0);
    const anim2 = createDotAnimation(dot2, 150);
    const anim3 = createDotAnimation(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotStyle = (animValue: Animated.Value) => ({
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#a78bfa",
    marginHorizontal: 2,
    opacity: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        scale: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.8, 1.2],
        }),
      },
    ],
  });

  return (
    <View
      style={{
        alignItems: "flex-start",
        marginBottom: 12,
        paddingHorizontal: 4,
      }}
    >
      <View
        style={{
          backgroundColor: "#f5f3ff",
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 12,
          maxWidth: "80%",
          borderLeftWidth: 3,
          borderLeftColor: "#a78bfa",
        }}
      >
        {/* Header with icon and dots */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Ionicons name="sparkles" size={14} color="#7c3aed" />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: "#7c3aed",
              marginLeft: 6,
              marginRight: 8,
            }}
          >
            Thinking
          </Text>
          <Animated.View style={dotStyle(dot1)} />
          <Animated.View style={dotStyle(dot2)} />
          <Animated.View style={dotStyle(dot3)} />
        </View>

        {/* Streamed thought summary (if available) */}
        {thinking && thinking.trim().length > 0 && (
          <Text
            style={{
              fontSize: 12,
              color: "#6d28d9",
              marginTop: 8,
              lineHeight: 18,
              fontStyle: "italic",
            }}
            numberOfLines={4}
          >
            {thinking}
          </Text>
        )}
      </View>
    </View>
  );
}
