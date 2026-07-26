import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  VoiceStatusIndicator,
  type VoicePhase,
} from "@/components/VoiceStatusIndicator";

interface ChatComposerProps {
  inputText: string;
  voicePhase: VoicePhase;
  isRecording: boolean;
  isGenerating: boolean;
  isPreparingVoice: boolean;
  voiceUnavailable: boolean;
  isPlaybackActive: boolean;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStartRecording: () => void;
  onEndVoiceSession: () => void;
}

export function ChatComposer({
  inputText,
  voicePhase,
  isRecording,
  isGenerating,
  isPreparingVoice,
  voiceUnavailable,
  isPlaybackActive,
  onChangeText,
  onSend,
  onStartRecording,
  onEndVoiceSession,
}: ChatComposerProps) {
  const [shouldAutoFocus, setShouldAutoFocus] = useState(true);
  const hasContent = inputText.trim().length > 0;
  const isTranscribing = voicePhase === "transcribing";
  const isVoiceStatusVisible = voicePhase !== "idle";
  const voiceActionUnavailable =
    (isPreparingVoice || voiceUnavailable || isPlaybackActive) && !hasContent;
  const actionDisabled =
    isGenerating || isTranscribing || voiceActionUnavailable;

  const handleStartRecording = () => {
    Keyboard.dismiss();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    onStartRecording();
  };

  return (
    <View className="mb-[8px] flex-row items-end bg-background px-4 py-6">
      {isVoiceStatusVisible ? (
        <View className="min-h-12 flex-1 justify-center overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <VoiceStatusIndicator phase={voicePhase} />
        </View>
      ) : (
        <TextInput
          className="max-h-32 min-h-12 flex-1 rounded-3xl border border-gray-200 bg-white px-5 py-3 text-base text-text"
          placeholder="Ask Rico anything..."
          placeholderTextColor="#9ca3af"
          value={inputText}
          onChangeText={onChangeText}
          autoFocus={shouldAutoFocus}
          onFocus={() => setShouldAutoFocus(false)}
          multiline
          editable={!isGenerating}
        />
      )}

      {isRecording && (
        <TouchableOpacity
          className="ml-2 h-12 w-12 items-center justify-center rounded-3xl bg-red-500"
          onPress={onEndVoiceSession}
          accessibilityRole="button"
          accessibilityLabel="End voice session"
        >
          <Ionicons name="stop" size={20} color="white" />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        className={`h-12 w-12 items-center justify-center rounded-3xl ${
          isRecording ? "ml-2" : "ml-3"
        } ${
          isGenerating || isTranscribing || voiceActionUnavailable
            ? "bg-gray-200"
            : "bg-primary"
        }`}
        disabled={actionDisabled}
        onPress={hasContent ? onSend : handleStartRecording}
        accessibilityRole="button"
        accessibilityLabel={
          isTranscribing
            ? "Transcribing audio"
            : hasContent
              ? "Send message"
              : "Start listening"
        }
        accessibilityState={{ disabled: actionDisabled }}
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color="white" />
        ) : isPreparingVoice && !hasContent ? (
          <ActivityIndicator size="small" color="white" />
        ) : hasContent ? (
          <Ionicons
            name="send"
            size={20}
            color="white"
            style={{ marginLeft: 3 }}
          />
        ) : (
          <Ionicons name="mic" size={24} color="white" />
        )}
      </TouchableOpacity>
    </View>
  );
}
