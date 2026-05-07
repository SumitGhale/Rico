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
  Animated,
  Easing,
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
const SILENCE_TIMEOUT_MS = 2000;   // Auto-send after 2s of silence
const MIN_TRANSCRIPT_LENGTH = 2;   // Don't auto-send single-char hallucinations

export default function ChatbotScreen() {
  const [inputText, setInputText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSendingPending, setIsSendingPending] = useState(false);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Silence timer ref for VAD auto-send
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether current recording was voice-initiated (for auto-restart)
  const voiceSessionActiveRef = useRef(false);

  // Pulsing animation for the auto-send indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Whisper (on-device speech-to-text)
  const { initializeWhisperModel, whisperContext, initializingModel } = useWhisperModel();

  // Gemini LLM
  const { sendMessage, messages, isGenerating, thinking, resetChat } = useLLM();

  // Calendar events (shared with Calendar screen)
  const { addEvents, updateEvents, deleteEvents } = useCalendarEvents();

  // Text-to-Speech
  const { speak, stop: stopSpeech, isSpeaking } = useSpeech();

  // Audio playback & recording permissions
  const { isPlaying, isPlaybackActive, isMuted, playAudio, toggleMute, checkRecordingPermission } = useAudio();

  // Track message count to detect new model responses
  const prevMessageCountRef = useRef(0);

  useEffect(() => {    
    async function initialize() {
      initializeWhisperModel("ggml-tiny.en-q5_1");
    }
    initialize();
  }, []);

  // Cleanup: release whisper context, stop recording & speech on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      // Stop any active recording
      if (stopRef.current) {
        stopRef.current().catch(console.warn);
        stopRef.current = null;
      }
      // Release whisper context to free native memory
      if (whisperContext) {
        whisperContext.release().catch(console.warn);
      }
      // Stop any active speech
      stopSpeech();
    };
  }, [whisperContext, stopSpeech]);

  // Auto-speak new model responses
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "model" && !lastMessage.text.startsWith("⚠️")) {
        if (lastMessage.audioContent) {
          playAudio(lastMessage.audioContent);
        }
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, playAudio]);

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

  // Pulsing animation for the "Sending soon…" indicator
  useEffect(() => {
    if (isSendingPending) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSendingPending, pulseAnim]);

  // ─── Silence Timer Helpers ───────────────────────────────────────────────────

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsSendingPending(false);
  }, []);

  const resetSilenceTimer = useCallback((currentTranscript: string) => {
    clearSilenceTimer();

    // Only start the timer if we have enough transcript content
    if (currentTranscript.trim().length >= MIN_TRANSCRIPT_LENGTH) {
      setIsSendingPending(true);
      silenceTimerRef.current = setTimeout(() => {
        console.log("🔇 Silence detected — auto-sending message");
        silenceTimerRef.current = null;
        setIsSendingPending(false);
        // Trigger auto-send
        handleAutoSend(currentTranscript);
      }, SILENCE_TIMEOUT_MS);
    }
  }, []);



  // ─── Auto-Send (triggered by silence detection) ──────────────────────────────

  const handleAutoSend = useCallback(async (transcriptText: string) => {
    const textToSend = transcriptText.trim();
    if (!textToSend || textToSend.length < MIN_TRANSCRIPT_LENGTH) return;

    // Stop recording
    try {
      await stopRef.current?.();
    } catch (error) {
      console.warn("Error stopping recording:", error);
    } finally {
      setIsRecording(false);
      stopRef.current = null;
    }

    // Clear inputs
    setTranscript("");
    setInputText("");

    // Send to Gemini
    await sendMessage(textToSend);
  }, [sendMessage]);

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

    try {
      const { stop, subscribe } = await whisperContext.transcribeRealtime({
        language: "en",
        realtimeAudioMinSec: 2,
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
        const { isCapturing, data, processTime, recordingTime } = event;

        if (data?.result) {
          const currentResult = data.result.trim();
          setTranscript(currentResult);

          // Reset the silence timer — user is still speaking
          if (isCapturing && currentResult.length >= MIN_TRANSCRIPT_LENGTH) {
            resetSilenceTimer(currentResult);
          }
        }

        if (!isCapturing) {
          console.log("Speech segment finished");
          clearSilenceTimer();
        }
      });
    } catch (error) {
      console.log("Error starting realtime transcription:", error);
      setIsRecording(false);
    }
  }

  const stopRecording = useCallback(async () => {
    clearSilenceTimer();
    // Deactivate voice session when user manually stops
    voiceSessionActiveRef.current = false;
    try {
      await stopRef.current?.();
    } catch (error) {
      console.warn("Error stopping recording:", error);
    } finally {
      setIsRecording(false);
      stopRef.current = null;
    }
  }, [clearSilenceTimer]);

  /**
   * Handle sending a message — stops recording if active, then sends.
   */
  const handleSend = useCallback(async () => {
    clearSilenceTimer();
    // Stop any active speech
    stopSpeech();

    // Stop recording first if active
    if (isRecording) {
      // Keep voice session active for manual sends too (user tapped send during recording)
      try {
        await stopRef.current?.();
      } catch (error) {
        console.warn("Error stopping recording:", error);
      } finally {
        setIsRecording(false);
        stopRef.current = null;
      }
    }

    const textToSend = inputText.trim() || transcript.trim();
    if (!textToSend || isGenerating) return;

    // Clear inputs
    setInputText("");
    setTranscript("");
    Keyboard.dismiss();

    // Send to Gemini
    await sendMessage(textToSend);
  }, [inputText, transcript, isGenerating, isRecording, sendMessage, stopSpeech, clearSilenceTimer]);

  // ─── End voice session (stop the hands-free loop) ────────────────────────────

  const endVoiceSession = useCallback(() => {
    voiceSessionActiveRef.current = false;
    clearSilenceTimer();
    stopRecording();
  }, [clearSilenceTimer, stopRecording]);

  const hasContent = inputText.trim().length > 0 || transcript.trim().length > 0;
  const hasMessages = messages.length > 0;

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
            {voiceSessionActiveRef.current && (isRecording || isGenerating || isPlaying) && (
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
            borderLeftColor: isSendingPending ? "#f59e0b" : "#22c55e",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12, color: isSendingPending ? "#d97706" : "#16a34a", fontWeight: "600" }}>
              {isSendingPending ? "⏳ Sending soon…" : "🎙️ Listening..."}
            </Text>
            {isSendingPending && (
              <Animated.View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#f59e0b",
                  opacity: pulseAnim,
                }}
              />
            )}
          </View>
          <Text style={{ fontSize: 14, color: "#1f2937", marginTop: 2 }}>
            {transcript}
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
              : initializingModel && !hasContent
                ? "#9ca3af"
                : "#3b82f6",
          }}
          disabled={isGenerating || (initializingModel && !hasContent)}
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
          ) : initializingModel && !hasContent ? (
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
