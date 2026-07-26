import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeOutUp,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export type VoicePhase = "idle" | "listening" | "transcribing";

type ActiveVoicePhase = Exclude<VoicePhase, "idle">;

interface VoiceStatusIndicatorProps {
  phase: ActiveVoicePhase;
}

const WAVE_BARS = [
  { delay: 0, height: 13 },
  { delay: 100, height: 20 },
  { delay: 200, height: 16 },
  { delay: 150, height: 19 },
  { delay: 50, height: 14 },
] as const;

function WaveBar({
  delay,
  peakHeight,
  reduceMotion,
}: {
  delay: number;
  peakHeight: number;
  reduceMotion: boolean;
}) {
  const height = useSharedValue(6);

  useEffect(() => {
    if (reduceMotion) {
      height.value = Math.max(8, peakHeight * 0.65);
      return;
    }

    const easing = Easing.inOut(Easing.ease);
    height.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(peakHeight, { duration: 500, easing }),
          withTiming(6, { duration: 500, easing }),
        ),
        -1,
      ),
    );

    return () => cancelAnimation(height);
  }, [delay, height, peakHeight, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 4,
          marginHorizontal: 2,
          borderRadius: 999,
          backgroundColor: "#0380FB",
        },
        animatedStyle,
      ]}
    />
  );
}

function ListeningWaveform({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <View className="h-6 flex-row items-center">
      {WAVE_BARS.map((bar, index) => (
        <WaveBar
          key={index}
          delay={bar.delay}
          peakHeight={bar.height}
          reduceMotion={reduceMotion}
        />
      ))}
    </View>
  );
}

function TranscribingDot({
  delay,
  reduceMotion,
}: {
  delay: number;
  reduceMotion: boolean;
}) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      translateY.value = 0;
      return;
    }

    const easing = Easing.inOut(Easing.ease);
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 280, easing }),
          withTiming(0, { duration: 420, easing }),
          withDelay(700, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    );

    return () => cancelAnimation(translateY);
  }, [delay, reduceMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0.65
      : interpolate(translateY.value, [-6, 0], [1, 0.5]),
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 6,
          height: 6,
          marginHorizontal: 3,
          borderRadius: 3,
          backgroundColor: "#6b7280",
        },
        animatedStyle,
      ]}
    />
  );
}

function TranscribingDots({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <View className="h-6 flex-row items-center">
      {[0, 160, 320].map((delay) => (
        <TranscribingDot
          key={delay}
          delay={delay}
          reduceMotion={reduceMotion}
        />
      ))}
    </View>
  );
}

export function VoiceStatusIndicator({ phase }: VoiceStatusIndicatorProps) {
  const reduceMotion = useReducedMotion();
  const isListening = phase === "listening";

  return (
    <Animated.View
      key={phase}
      entering={reduceMotion ? undefined : FadeInDown.duration(180)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(150)}
      className="flex-row items-center px-5"
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={isListening ? "Listening" : "Transcribing"}
    >
      <Text
        className={`mr-3 text-s font-semibold ${
          isListening ? "text-primary" : "text-gray-500"
        }`}
      >
        {isListening ? "Listening" : "Transcribing"}
      </Text>
      {isListening ? (
        <ListeningWaveform reduceMotion={reduceMotion} />
      ) : (
        <TranscribingDots reduceMotion={reduceMotion} />
      )}
    </Animated.View>
  );
}
