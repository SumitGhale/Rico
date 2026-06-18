import { DeleteConfirmation } from "@/components/DeleteConfirmation";
import { MessageBubble } from "@/components/MessageBubble";
import { ScheduleConfirmation } from "@/components/ScheduleConfirmation";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { UpdateConfirmation } from "@/components/UpdateConfirmation";
import { useAudio } from "@/hooks/useAudio";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useLLM } from "@/hooks/useLLM";
import { useSpeech } from "@/hooks/useSpeech";
import { useWhisperModel } from "@/hooks/useWhisperModel";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ─── VAD Config ────────────────────────────────────────────────────────────────
const ENDPOINT_STABILITY_MS = 1500;
const MIN_TRANSCRIPT_LENGTH = 2;   // Don't auto-send single-char hallucinations

export default function ChatbotScreen() {
  const [inputText, setInputText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const endpointTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTranscriptRef = useRef("");
  const utteranceSubmittedRef = useRef(false);

  // Track whether current recording was voice-initiated (for auto-restart)
  const voiceSessionActiveRef = useRef(false);

  // Whisper (on-device speech-to-text)
  const {
    initializeWhisperModel,
    whisperContext,
    initializingModel,
    isDownloading,
    preferencesLoaded,
    selectedModelId,
    error: modelError,
    setVoiceRecordingActive,
  } = useWhisperModel();

  // Audio playback & recording permissions
  const {
    isPlaying,
    isPlaybackActive,
    isMuted,
    beginAudioStream,
    enqueueAudio,
    finishAudioStream,
    clearAudioQueue,
    toggleMute,
    checkRecordingPermission,
  } = useAudio();

  // Gemini LLM
  const {
    sendMessage,
    messages,
    isGenerating,
    thinking,
    resetChat,
    error,
    cancelGeneration,
  } = useLLM({
    onAudioStreamStart: beginAudioStream,
    onAudioChunk: enqueueAudio,
    onAudioStreamComplete: finishAudioStream,
    onAudioStreamCancel: clearAudioQueue,
  });

  // Calendar events (shared with Calendar screen)
  const { addEvents, updateEvents, deleteEvents } = useCalendarEvents();

  // Text-to-Speech
  const { stop: stopSpeech } = useSpeech();

  useEffect(() => {
    if (preferencesLoaded) {
      initializeWhisperModel(selectedModelId);
    }
  }, [initializeWhisperModel, preferencesLoaded, selectedModelId]);

  const clearEndpointTimer = useCallback(() => {
    if (endpointTimerRef.current) {
      clearTimeout(endpointTimerRef.current);
      endpointTimerRef.current = null;
    }
  }, []);

  // The provider owns the Whisper context; this screen only owns recording.
  useEffect(() => {
    return () => {
      clearEndpointTimer();
      if (stopRef.current) {
        stopRef.current().catch(console.warn);
        stopRef.current = null;
      }
      setVoiceRecordingActive(false);
      stopSpeech();
      cancelGeneration();
      clearAudioQueue();
    };
  }, [
    cancelGeneration,
    clearAudioQueue,
    clearEndpointTimer,
    setVoiceRecordingActive,
    stopSpeech,
  ]);

  // Auto-restart recording after TTS finishes (hands-free conversational loop)
  useEffect(() => {
    // When TTS just finished AND we're in voice session mode AND not generating
    // IMPORTANT: also check isPlaybackActive to avoid the race where
    // isPlaying is still false while the audio is loading
    if (
      !isPlaying &&
      !isPlaybackActive &&
      voiceSessionActiveRef.current &&
      !isGenerating &&
      !isRecording &&
      whisperContext &&
      !initializingModel
    ) {
      // Small delay so audio session can switch cleanly from playback to recording
      const restartTimer = setTimeout(() => {
        if (
          voiceSessionActiveRef.current &&
          !isRecording &&
          !isGenerating
        ) {
          console.log("🔄 Auto-restarting recording (hands-free mode)");
          startRealtimeTranscribtion();
        }
      }, 500);
      return () => clearTimeout(restartTimer);
    }
  }, [isPlaying, isPlaybackActive, isGenerating, isRecording, whisperContext, initializingModel]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0 || isGenerating) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isGenerating, thinking]);

  // The legacy Whisper API does not end capture on silence. Keep one short
  // transcript-stability timer while native VAD filters non-speech audio.
  const finalizeVoiceTranscript = useCallback(async (transcriptText: string) => {
    const textToSend = transcriptText.trim();
    if (
      utteranceSubmittedRef.current ||
      !textToSend ||
      textToSend.length < MIN_TRANSCRIPT_LENGTH
    ) {
      return;
    }

    utteranceSubmittedRef.current = true;
    clearEndpointTimer();
    try {
      await stopRef.current?.();
    } catch (error) {
      console.warn("Error stopping recording:", error);
    } finally {
      setIsRecording(false);
      setVoiceRecordingActive(false);
      stopRef.current = null;
    }

    latestTranscriptRef.current = "";
    setTranscript("");
    setInputText("");
    await sendMessage(textToSend);
  }, [clearEndpointTimer, sendMessage, setVoiceRecordingActive]);

  const scheduleEndpointSend = useCallback((currentTranscript: string) => {
    clearEndpointTimer();
    if (currentTranscript.trim().length < MIN_TRANSCRIPT_LENGTH) return;

    endpointTimerRef.current = setTimeout(() => {
      endpointTimerRef.current = null;
      finalizeVoiceTranscript(latestTranscriptRef.current);
    }, ENDPOINT_STABILITY_MS);
  }, [clearEndpointTimer, finalizeVoiceTranscript]);

  // ─── Recording ───────────────────────────────────────────────────────────────

  const startRealtimeTranscribtion = async () => {
    // Stop any active speech when user starts recording
    stopSpeech();
    const isPermissionGranted = await checkRecordingPermission();
    if (!isPermissionGranted) return;

    // Guard against double-tap
    if (isRecording) {
      console.log("Already recording");
      return;
    }
    if (!whisperContext) {
      console.log("Whisper context not initialized");
      return;
    }

    // Mark voice session as active (for auto-restart after TTS)
    voiceSessionActiveRef.current = true;
    utteranceSubmittedRef.current = false;
    latestTranscriptRef.current = "";
    setVoiceRecordingActive(true);

    try {
      const { stop, subscribe } = await whisperContext.transcribeRealtime({
        language: "en",
        realtimeAudioMinSec: 1,
        realtimeAudioSliceSec: 20,
        realtimeAudioSec: 300,
        // Enable native energy-based VAD to reduce hallucinations during silence
        useVad: true,
        vadMs: 2000,
        vadThold: 0.7,
        audioSessionOnStartIos: {
          category: "PlayAndRecord" as any,
          options: ["MixWithOthers" as any],
          mode: "Default" as any,
        },
        audioSessionOnStopIos: "restore" as any,
      });
      stopRef.current = stop;
      setIsRecording(true);

      // Subscribe to transcription events
      subscribe((event: any) => {
        const { isCapturing, error, data } = event;

        if (error) {
          console.error("Transcription error:", error);
          return;
        }

        if (data?.result) {
          const currentResult = data.result.trim();
          latestTranscriptRef.current = currentResult;
          setTranscript(currentResult);

          if (isCapturing && currentResult.length >= MIN_TRANSCRIPT_LENGTH) {
            scheduleEndpointSend(currentResult);
          }
        }

        if (!isCapturing) {
          console.log("Speech segment finished");
          clearEndpointTimer();
          finalizeVoiceTranscript(
            data?.result?.trim() || latestTranscriptRef.current
          );
        }
      });
    } catch (error) {
      console.log("Error starting realtime transcription:", error);
      setIsRecording(false);
      setVoiceRecordingActive(false);
    }
  }

  const stopRecording = useCallback(async () => {
    clearEndpointTimer();
    utteranceSubmittedRef.current = true;
    // Deactivate voice session when user manually stops
    voiceSessionActiveRef.current = false;
    try {
      await stopRef.current?.();
    } catch (error) {
      console.warn("Error stopping recording:", error);
    } finally {
      setIsRecording(false);
      setVoiceRecordingActive(false);
      stopRef.current = null;
    }
  }, [clearEndpointTimer, setVoiceRecordingActive]);

  /**
   * Handle sending a message — stops recording if active, then sends.
   */
  const handleSend = useCallback(async () => {
    clearEndpointTimer();
    // Stop any active speech
    stopSpeech();

    // Stop recording first if active
    if (isRecording) {
      // Keep voice session active for manual sends too (user tapped send during recording)
      utteranceSubmittedRef.current = true;
      try {
        await stopRef.current?.();
      } catch (error) {
        console.warn("Error stopping recording:", error);
      } finally {
        setIsRecording(false);
        setVoiceRecordingActive(false);
        stopRef.current = null;
      }
    }

    const textToSend = inputText.trim() || transcript.trim();
    if (!textToSend || isGenerating) return;

    // Clear inputs
    setInputText("");
    setTranscript("");
    latestTranscriptRef.current = "";
    Keyboard.dismiss();

    // Send to Gemini
    await sendMessage(textToSend);
  }, [inputText, transcript, isGenerating, isRecording, sendMessage, stopSpeech, clearEndpointTimer, setVoiceRecordingActive]);

  // ─── End voice session (stop the hands-free loop) ────────────────────────────

  const endVoiceSession = useCallback(() => {
    voiceSessionActiveRef.current = false;
    clearEndpointTimer();
    cancelGeneration();
    clearAudioQueue();
    stopRecording();
  }, [
    cancelGeneration,
    clearAudioQueue,
    clearEndpointTimer,
    stopRecording,
  ]);

  const hasContent = inputText.trim().length > 0 || transcript.trim().length > 0;
  const hasMessages = messages.length > 0;
  const voiceUnavailable = !whisperContext && !hasContent;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#ffffff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Header with mute toggle and reset button */}
      {hasMessages && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 4,
          }}
        >
          {/* Mute / Unmute toggle */}
          <TouchableOpacity
            onPress={toggleMute}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: isMuted ? "#fef2f2" : "#f0fdf4",
            }}
          >
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={14}
              color={isMuted ? "#ef4444" : "#22c55e"}
            />
            <Text
              style={{
                fontSize: 12,
                color: isMuted ? "#ef4444" : "#22c55e",
                marginLeft: 4,
                fontWeight: "500",
              }}
            >
              {isMuted ? "Muted" : "Voice on"}
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* End voice session button (visible when hands-free loop is active) */}
            {voiceSessionActiveRef.current &&
              (isRecording || isGenerating || isPlaybackActive) && (
                <TouchableOpacity
                  onPress={() => {
                    stopSpeech();
                    endVoiceSession();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: "#fef2f2",
                  }}
                >
                  <Ionicons name="stop-circle" size={14} color="#ef4444" />
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#ef4444",
                      marginLeft: 4,
                      fontWeight: "500",
                    }}
                  >
                    End voice
                  </Text>
                </TouchableOpacity>
              )}

            <TouchableOpacity
              onPress={() => {
                stopSpeech();
                endVoiceSession();
                resetChat();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: "#f3f4f6",
              }}
            >
              <Ionicons name="refresh" size={14} color="#6b7280" />
              <Text
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginLeft: 4,
                  fontWeight: "500",
                }}
              >
                New chat
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Model Downloading Banner */}
      {isDownloading && (
        <View className="flex-row items-center justify-center bg-blue-50 py-[10px] px-4 border-b border-blue-100">
          <ActivityIndicator size="small" color="#3b82f6" className="mr-2" />
          <Text className="text-blue-700 text-[13px] font-medium">
            Downloading speech model...
          </Text>
        </View>
      )}

      {/* Chat Messages Area */}
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1, paddingHorizontal: 16 }}
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Empty state */}
        {!hasMessages && !isGenerating && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text
              style={{
                color: "#9ca3af",
                marginTop: 12,
                fontSize: 16,
                textAlign: "center",
              }}
            >
              Start a conversation...
            </Text>
            <Text
              style={{
                color: "#d1d5db",
                marginTop: 4,
                fontSize: 13,
                textAlign: "center",
              }}
            >
              Type a message or tap the mic to speak
            </Text>
          </View>
        )}

        {/* Message bubbles */}
        {messages.map((msg) => (
          <View key={msg.id}>
            <MessageBubble message={msg} />
            {msg.scheduleEvents && msg.scheduleEvents.length > 0 && (
              <ScheduleConfirmation
                events={msg.scheduleEvents}
                onConfirm={() => addEvents(msg.scheduleEvents!)}
                onDismiss={() => { }}
              />
            )}
            {msg.scheduleUpdates && msg.scheduleUpdates.length > 0 && (
              <UpdateConfirmation
                updates={msg.scheduleUpdates}
                onConfirm={() => updateEvents(msg.scheduleUpdates!)}
                onDismiss={() => { }}
              />
            )}
            {msg.scheduleDeletes && msg.scheduleDeletes.length > 0 && (
              <DeleteConfirmation
                deletes={msg.scheduleDeletes}
                onConfirm={() => deleteEvents(msg.scheduleDeletes!)}
                onDismiss={() => { }}
              />
            )}
          </View>
        ))}

        {/* Thinking indicator (shown while model is reasoning) */}
        {isGenerating && <ThinkingIndicator thinking={thinking} />}
      </ScrollView>

      {/* Live transcript preview (shown while recording) */}
      {isRecording && transcript.length > 0 && (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 4,
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: "#f0fdf4",
            borderRadius: 12,
            borderLeftWidth: 3,
            borderLeftColor: "#22c55e",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#16a34a", fontWeight: "600" }}>
              Listening...
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: "#1f2937", marginTop: 2 }}>
            {transcript}
          </Text>
        </View>
      )}

      {/* Error Banner */}
      {error && (
        <View style={{ backgroundColor: "#fef2f2", padding: 10, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: "#fca5a5" }}>
          <Text style={{ color: "#b91c1c", fontSize: 13, textAlign: "center", fontWeight: "500" }}>⚠️ {error}</Text>
        </View>
      )}

      {modelError && (
        <View style={{ backgroundColor: "#fff7ed", padding: 10, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: "#fdba74" }}>
          <Text style={{ color: "#c2410c", fontSize: 13, textAlign: "center", fontWeight: "500" }}>
            Speech model unavailable: {modelError}
          </Text>
        </View>
      )}

      {/* Input Area */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: 16,
          paddingVertical: 12,
          marginBottom: 5,
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb",
          backgroundColor: "#ffffff",
        }}
      >
        <TextInput
          style={{
            flex: 1,
            backgroundColor: "#f3f4f6",
            borderRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 12,
            fontSize: 16,
            color: "#1f2937",
            maxHeight: 128,
            minHeight: 48,
          }}
          placeholder="Message..."
          placeholderTextColor="#9ca3af"
          value={inputText || transcript}
          onChangeText={(text) => {
            setInputText(text);
            if (transcript) setTranscript("");
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          multiline
          editable={!isGenerating}
        />

        {/* Stop button — ends recording & voice session (only visible while recording) */}
        {isRecording && (
          <TouchableOpacity
            style={{
              marginLeft: 8,
              borderRadius: 24,
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#ef4444",
            }}
            onPress={endVoiceSession}
          >
            <Ionicons name="stop" size={20} color="white" />
          </TouchableOpacity>
        )}

        {/* Main action button: Send (has content) or Mic (empty) */}
        <TouchableOpacity
          style={{
            marginLeft: isRecording ? 8 : 12,
            borderRadius: 24,
            width: 48,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isGenerating
              ? "#9ca3af"
              : (initializingModel || voiceUnavailable || isPlaybackActive) && !hasContent
                ? "#9ca3af"
                : "#3b82f6",
          }}
          disabled={isGenerating || ((initializingModel || voiceUnavailable || isPlaybackActive) && !hasContent)}
          onPress={() => {
            if (hasContent) {
              handleSend();
            } else {
              startRealtimeTranscribtion();
            }
          }}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color="white" />
          ) : (initializingModel || isDownloading) && !hasContent ? (
            <ActivityIndicator size="small" color="white" />
          ) : hasContent ? (
            <Ionicons name="send" size={20} color="white" style={{ marginLeft: 3 }} />
          ) : (
            <Ionicons name="mic" size={24} color="white" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
