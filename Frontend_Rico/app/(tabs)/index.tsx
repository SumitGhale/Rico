import { ConversationSidebar } from "@/components/ConversationSidebar";
import { DeleteConfirmation } from "@/components/DeleteConfirmation";
import { MessageBubble } from "@/components/MessageBubble";
import { ScheduleConfirmation } from "@/components/ScheduleConfirmation";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { UpdateConfirmation } from "@/components/UpdateConfirmation";
import { useAudio } from "@/hooks/useAudio";
import { useAuth } from "@/hooks/useAuth";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useLLM } from "@/hooks/useLLM";
import { useSpeech } from "@/hooks/useSpeech";
import { useWhisperModel } from "@/hooks/useWhisperModel";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

// ─── Empty-state suggestion prompts ──────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: "calendar-outline", label: "Schedule a dentist appointment" },
  { icon: "refresh-outline", label: "Move my standup to 10 am" },
  { icon: "time-outline", label: "Block focus time this week" },
] as const;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => setIsSidebarOpen(true)}
          className="ml-[15px]"
        >
          <Ionicons name="menu" size={25} color="#374151" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
    loadConversation,
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

  // Authenticated user (for the greeting on the empty state)
  const { user } = useAuth();
  const firstName =
    user?.name?.trim().split(" ")[0] || user?.email?.split("@")[0] || "there";
  const greeting = getGreeting();

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
    await sendMessage(textToSend, isMuted);
  }, [clearEndpointTimer, sendMessage, setVoiceRecordingActive, isMuted]);

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
          // DefaultToSpeaker routes output to the loud bottom speaker instead of
          // the earpiece receiver. Without it, PlayAndRecord defaults to the
          // earpiece, so TTS plays back quiet/"phone-call"-like. Since we don't
          // restore the session on stop, this config also governs TTS playback,
          // and it matches the app-wide mode in _layout.tsx.
          options: ["MixWithOthers" as any, "DefaultToSpeaker" as any],
          mode: "Default" as any,
        },
        // Do NOT pass "restore" here: it reconfigures/deactivates the iOS audio
        // session asynchronously on stop, which can land mid-TTS-playback and
        // break the next chunk's session activation. Omitting it keeps the
        // session in its current PlayAndRecord state, matching the app-wide mode
        // set in _layout.tsx.
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
    await sendMessage(textToSend, isMuted);
  }, [inputText, transcript, isGenerating, isRecording, sendMessage, stopSpeech, clearEndpointTimer, setVoiceRecordingActive, isMuted]);

  // Send a tapped suggestion prompt from the empty state
  const handleSuggestion = useCallback(
    (text: string) => {
      if (isGenerating) return;
      stopSpeech();
      sendMessage(text, isMuted);
    },
    [isGenerating, sendMessage, stopSpeech, isMuted]
  );

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
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Header with mute toggle and reset button */}
      {hasMessages && (
        <View className="flex-row justify-between items-center px-4 pt-2 pb-1">
          {/* Mute / Unmute toggle */}
          <TouchableOpacity
            onPress={toggleMute}
            className={`flex-row items-center px-3 py-1.5 rounded-2xl ${isMuted ? "bg-red-50" : "bg-green-50"}`}
          >
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={14}
              color={isMuted ? "#ef4444" : "#22c55e"}
            />
            <Text
              className={`text-xs ml-1 font-medium ${isMuted ? "text-red-500" : "text-green-500"}`}
            >
              {isMuted ? "Muted" : "Voice on"}
            </Text>
          </TouchableOpacity>

          <View className="flex-row items-center gap-2">
            {/* End voice session button (visible when hands-free loop is active) */}
            {voiceSessionActiveRef.current &&
              (isRecording || isGenerating || isPlaybackActive) && (
                <TouchableOpacity
                  onPress={() => {
                    stopSpeech();
                    endVoiceSession();
                  }}
                  className="flex-row items-center px-3 py-1.5 rounded-2xl bg-red-50"
                >
                  <Ionicons name="stop-circle" size={14} color="#ef4444" />
                  <Text className="text-xs text-red-500 ml-1 font-medium">
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
              className="flex-row items-center px-3 py-1.5 rounded-2xl bg-gray-100"
            >
              <Ionicons name="refresh" size={14} color="#6b7280" />
              <Text className="text-xs text-gray-500 ml-1 font-medium">
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
        className="flex-1 px-4"
        contentContainerClassName="grow py-4"
        keyboardShouldPersistTaps="handled"
      >
        {/* Empty state */}
        {!hasMessages && !isGenerating && (
          <View className="flex-1 justify-center">
            {/* Greeting */}
            <Text
              style={{ fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" }}
              className="text-4xl font-bold text-text"
            >
              {greeting}, {firstName}.
            </Text>
            <Text
              style={{ fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" }}
              className="text-4xl text-gray-400 mb-8"
            >
              What&apos;s on your plate?
            </Text>

            {/* Suggestion cards */}
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s.label}
                onPress={() => handleSuggestion(s.label)}
                className="flex-row items-center bg-white rounded-2xl border border-gray-200 px-4 py-4 mb-3"
              >
                <Ionicons name={s.icon} size={20} color="#ADEBB3" />
                <Text className="flex-1 text-text text-base ml-3">{s.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
              </TouchableOpacity>
            ))}
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
        <View className="mx-4 mb-1 px-[14px] py-2 bg-green-50 rounded-xl border-l-[3px] border-l-green-500">
          <View className="flex-row items-center">
            <Text className="text-xs text-green-600 font-semibold">
              Listening...
            </Text>
          </View>
          <Text className="text-sm text-gray-800 mt-0.5">
            {transcript}
          </Text>
        </View>
      )}

      {/* Error Banner */}
      {error && (
        <View className="bg-red-50 p-[10px] mx-4 mb-2 rounded-xl border border-red-300">
          <Text className="text-red-700 text-[13px] text-center font-medium">⚠️ {error}</Text>
        </View>
      )}

      {modelError && (
        <View className="bg-orange-50 p-[10px] mx-4 mb-2 rounded-xl border border-orange-300">
          <Text className="text-orange-700 text-[13px] text-center font-medium">
            Speech model unavailable: {modelError}
          </Text>
        </View>
      )}

      {/* Input Area */}
      <View className="flex-row items-end px-4 py-6 mb-[8px] bg-background">
        <TextInput
          className="flex-1 bg-white border border-gray-200 rounded-3xl px-5 py-3 text-base text-text max-h-32 min-h-12"
          placeholder="Ask Rico anything..."
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
            className="ml-2 rounded-3xl w-12 h-12 items-center justify-center bg-red-500"
            onPress={endVoiceSession}
          >
            <Ionicons name="stop" size={20} color="white" />
          </TouchableOpacity>
        )}

        {/* Main action button: Send (has content) or Mic (empty) */}
        <TouchableOpacity
          className={`rounded-3xl w-12 h-12 items-center justify-center ${isRecording ? "ml-2" : "ml-3"} ${
            isGenerating
              ? "bg-gray-200"
              : (initializingModel || voiceUnavailable || isPlaybackActive) && !hasContent
                ? "bg-gray-200"
                : "bg-primary"
          }`}
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
            <ActivityIndicator size="small" color="#2A2A2A" />
          ) : (initializingModel || isDownloading) && !hasContent ? (
            <ActivityIndicator size="small" color="#2A2A2A" />
          ) : hasContent ? (
            <Ionicons name="send" size={20} color="#2A2A2A" style={{ marginLeft: 3 }} />
          ) : (
            <Ionicons name="mic" size={24} color="#2A2A2A" />
          )}
        </TouchableOpacity>
      </View>

      <ConversationSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectConversation={loadConversation}
      />
    </KeyboardAvoidingView>
  );
}
