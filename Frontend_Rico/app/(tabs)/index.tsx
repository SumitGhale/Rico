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
import { useWhisperModel } from "@/hooks/useWhisperModel";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { WhisperContext } from "whisper.rn/index.js";
import { RingBufferVad } from "whisper.rn/realtime-transcription/index.js";
import { PcmAudioStreamAdapter } from "@/utils/PcmAudioStreamAdapter";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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

// ─── Voice endpointing config ──────────────────────────────────────────────────
const MAX_RECORDING_MS = 5 * 60 * 1000; // hard cap on a single recording session
const MIN_TRANSCRIPT_LENGTH = 2; // Don't auto-send single-char hallucinations

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
  const [isRecording, setIsRecording] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const utteranceSubmittedRef = useRef(false);
  const audioStreamRef = useRef(new PcmAudioStreamAdapter());
  const vadRef = useRef<RingBufferVad | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const transcriptionTaskRef = useRef<ReturnType<
    WhisperContext["transcribeData"]
  > | null>(null);

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
    vadContext,
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

  const clearVoiceTimers = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  // The provider owns the Whisper/VAD contexts; this screen owns capture.
  useEffect(() => {
    return () => {
      utteranceSubmittedRef.current = true;
      clearVoiceTimers();
      transcriptionTaskRef.current?.stop().catch(console.warn);
      transcriptionTaskRef.current = null;
      audioStreamRef.current.release().catch(console.warn);
      vadRef.current?.reset().catch(console.warn);
      vadRef.current = null;
      setVoiceRecordingActive(false);
      cancelGeneration();
      clearAudioQueue();
    };
  }, [
    cancelGeneration,
    clearAudioQueue,
    clearVoiceTimers,
    setVoiceRecordingActive,
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
      !transcriptionTaskRef.current &&
      whisperContext &&
      vadContext &&
      !initializingModel
    ) {
      // Small delay so audio session can switch cleanly from playback to recording
      const restartTimer = setTimeout(() => {
        if (
          voiceSessionActiveRef.current &&
          !isRecording &&
          !isGenerating &&
          !transcriptionTaskRef.current
        ) {
          console.log("🔄 Auto-restarting recording (hands-free mode)");
          startVoiceRecording();
        }
      }, 500);
      return () => clearTimeout(restartTimer);
    }
  }, [
    isPlaying,
    isPlaybackActive,
    isGenerating,
    isRecording,
    whisperContext,
    vadContext,
    initializingModel,
  ]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0 || isGenerating) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isGenerating, thinking]);

  // Stop capture and clear recording state; shared by every stop path.
  const stopVoiceCapture = useCallback(async () => {
    clearVoiceTimers();
    try {
      await audioStreamRef.current.stop();
    } catch (error) {
      console.warn("Error stopping recording:", error);
    } finally {
      setIsRecording(false);
      setVoiceRecordingActive(false);
    }
  }, [clearVoiceTimers, setVoiceRecordingActive]);

  const transcribeAndSend = useCallback(async () => {
    if (utteranceSubmittedRef.current || !whisperContext) return;
    utteranceSubmittedRef.current = true;
    await stopVoiceCapture();

    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];
    const byteLength = chunks.reduce(
      (total, chunk) => total + chunk.byteLength,
      0,
    );
    if (byteLength === 0) return;

    const audio = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      audio.set(chunk, offset);
      offset += chunk.byteLength;
    }

    let task: ReturnType<typeof whisperContext.transcribeData> | null = null;
    try {
      console.log(
        "⏳ Waiting for Whisper to transcribe the completed utterance...",
      );
      task = whisperContext.transcribeData(audio.buffer, { language: "en" });
      transcriptionTaskRef.current = task;
      const result = await task.promise;
      console.log(
        "✅ Transcription complete:",
        new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      );
      if (transcriptionTaskRef.current !== task || result.isAborted) return;

      const textToSend = result.result.trim();
      if (textToSend.length < MIN_TRANSCRIPT_LENGTH) return;
      setInputText("");
      await sendMessage(textToSend, isMuted);
    } catch (error) {
      console.warn("Error transcribing recording:", error);
    } finally {
      if (task && transcriptionTaskRef.current === task) {
        transcriptionTaskRef.current = null;
      }
    }
  }, [isMuted, sendMessage, stopVoiceCapture, whisperContext]);

  const voiceHandlersRef = useRef({ onSpeechEnd: transcribeAndSend });
  useEffect(() => {
    voiceHandlersRef.current.onSpeechEnd = transcribeAndSend;
  }, [transcribeAndSend]);

  // ─── Recording ───────────────────────────────────────────────────────────────

  const startVoiceRecording = async () => {
    // Stop any active TTS playback when user starts recording
    clearAudioQueue();
    const isPermissionGranted = await checkRecordingPermission();
    if (!isPermissionGranted) return;

    // Guard against double-tap
    if (isRecording) {
      console.log("Already recording");
      return;
    }
    if (!whisperContext || !vadContext) {
      console.log("Whisper or VAD context not initialized");
      return;
    }

    // Mark voice session as active (for auto-restart after TTS)
    voiceSessionActiveRef.current = true;
    utteranceSubmittedRef.current = false;
    pcmChunksRef.current = [];

    try {
      const vad = new RingBufferVad(vadContext, {
        vadPreset: "default",
        speechRateThreshold: 0.5,
        vadOptions: { minSilenceDurationMs: 400 },
        logger: __DEV__ ? console.log : undefined,
      });
      vad.onSpeechStart((_confidence, preRollAudio) => {
        // console.log("🗣️ Speech started", new Date().toISOString(), {
        //   _confidence,
        // });
        if (!utteranceSubmittedRef.current)
          pcmChunksRef.current = [preRollAudio];
      });
      vad.onSpeechContinue((_confidence, audio) => {
        // const now = performance.now();
        // Avoid printing every audio chunk
        // if (now - lastVadLogAt >= 500) {
        //   lastVadLogAt = now;
        //   console.log("🎙️ VAD continues", new Date().toISOString(), {
        //     _confidence,
        //   });
        // }
        if (!utteranceSubmittedRef.current) pcmChunksRef.current.push(audio);
      });
      vad.onSpeechEnd((_confidence) => {
        // console.log("🛑 Speech ended", new Date().toISOString(), {
        //   _confidence,
        // });
        voiceHandlersRef.current.onSpeechEnd();
      });
      vad.onError((error) => console.warn("VAD error:", error));
      vadRef.current = vad;

      const audioStream = audioStreamRef.current;
      audioStream.onData(({ data }) => vad.processAudio(data));
      audioStream.onError((error) =>
        console.warn("Audio stream error:", error),
      );
      audioStream.onStatusChange((active) => {
        setIsRecording(active);
        setVoiceRecordingActive(active);
      });
      await audioStream.initialize({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
      });
      await audioStream.start();
      // Safety cap on a single recording session (e.g. user walks away and
      // VAD never endpoints); submits what we have or ends the session.
      maxDurationTimerRef.current = setTimeout(() => {
        maxDurationTimerRef.current = null;
        if (pcmChunksRef.current.length > 0) {
          voiceHandlersRef.current.onSpeechEnd();
        } else {
          utteranceSubmittedRef.current = true;
          voiceSessionActiveRef.current = false;
          stopVoiceCapture();
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      console.log("Error starting voice recording:", error);
      setIsRecording(false);
      setVoiceRecordingActive(false);
    }
  };

  const stopRecording = useCallback(async () => {
    utteranceSubmittedRef.current = true;
    // Deactivate voice session when user manually stops
    voiceSessionActiveRef.current = false;
    const task = transcriptionTaskRef.current;
    transcriptionTaskRef.current = null;
    await task?.stop();
    pcmChunksRef.current = [];
    await stopVoiceCapture();
    await vadRef.current?.reset();
  }, [stopVoiceCapture]);

  /**
   * Handle sending a message — stops recording if active, then sends.
   */
  const handleSend = useCallback(async () => {
    // Stop any active TTS playback
    clearAudioQueue();

    // Stop recording first if active
    if (isRecording) {
      // Keep voice session active for manual sends too (user tapped send during recording)
      utteranceSubmittedRef.current = true;
      await stopVoiceCapture();
    }

    const textToSend = inputText.trim();
    if (!textToSend || isGenerating) return;

    // Clear inputs
    setInputText("");
    Keyboard.dismiss();

    // Send to Gemini
    await sendMessage(textToSend, isMuted);
  }, [
    inputText,
    isGenerating,
    isRecording,
    sendMessage,
    clearAudioQueue,
    stopVoiceCapture,
    isMuted,
  ]);

  // Send a tapped suggestion prompt from the empty state
  const handleSuggestion = useCallback(
    (text: string) => {
      if (isGenerating) return;
      clearAudioQueue();
      sendMessage(text, isMuted);
    },
    [isGenerating, sendMessage, clearAudioQueue, isMuted],
  );

  // ─── End voice session (stop the hands-free loop) ────────────────────────────

  const endVoiceSession = useCallback(() => {
    voiceSessionActiveRef.current = false;
    cancelGeneration();
    clearAudioQueue();
    stopRecording();
  }, [cancelGeneration, clearAudioQueue, stopRecording]);

  const hasContent = inputText.trim().length > 0;
  const hasMessages = messages.length > 0;
  const voiceUnavailable = (!whisperContext || !vadContext) && !hasContent;

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
                    clearAudioQueue();
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
                clearAudioQueue();
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
              style={{
                fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
              }}
              className="text-4xl font-bold text-text"
            >
              {greeting}, {firstName}.
            </Text>
            <Text
              style={{
                fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
              }}
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
                <Ionicons name={s.icon} size={20} color="#47d254" />
                <Text className="flex-1 text-text text-base ml-3">
                  {s.label}
                </Text>
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
                onDismiss={() => {}}
              />
            )}
            {msg.scheduleUpdates && msg.scheduleUpdates.length > 0 && (
              <UpdateConfirmation
                updates={msg.scheduleUpdates}
                onConfirm={() => updateEvents(msg.scheduleUpdates!)}
                onDismiss={() => {}}
              />
            )}
            {msg.scheduleDeletes && msg.scheduleDeletes.length > 0 && (
              <DeleteConfirmation
                deletes={msg.scheduleDeletes}
                onConfirm={() => deleteEvents(msg.scheduleDeletes!)}
                onDismiss={() => {}}
              />
            )}
          </View>
        ))}

        {/* Thinking indicator (shown while model is reasoning) */}
        {isGenerating && <ThinkingIndicator thinking={thinking} />}
      </ScrollView>

      {/* Error Banner */}
      {error && (
        <View className="bg-red-50 p-[10px] mx-4 mb-2 rounded-xl border border-red-300">
          <Text className="text-red-700 text-[13px] text-center font-medium">
            ⚠️ {error}
          </Text>
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
          value={inputText}
          onChangeText={setInputText}
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
              : (initializingModel || voiceUnavailable || isPlaybackActive) &&
                  !hasContent
                ? "bg-gray-200"
                : "bg-primary"
          }`}
          disabled={
            isGenerating ||
            ((initializingModel || voiceUnavailable || isPlaybackActive) &&
              !hasContent)
          }
          onPress={() => {
            if (hasContent) {
              handleSend();
            } else {
              startVoiceRecording();
            }
          }}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color="white" />
          ) : (initializingModel || isDownloading) && !hasContent ? (
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

      <ConversationSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectConversation={loadConversation}
      />
    </KeyboardAvoidingView>
  );
}
