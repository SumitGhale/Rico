import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { Alert, Linking } from "react-native";

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAudio() {
  // Audio Player for TTS
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  const audioChunksRef = useRef(new Map<number, string>());
  const nextSequenceRef = useRef(0);
  const currentSequenceRef = useRef<number | null>(null);
  const finalSequenceCountRef = useRef<number | null>(null);
  const [queueRevision, setQueueRevision] = useState(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);

  useEffect(() => {
    if (currentSequenceRef.current !== null) return;

    const finalSequenceCount = finalSequenceCountRef.current;

    while (
      finalSequenceCount !== null &&
      nextSequenceRef.current < finalSequenceCount &&
      !audioChunksRef.current.has(nextSequenceRef.current)
    ) {
      // A TTS request failed, so the server emitted no audio for this sequence.
      nextSequenceRef.current += 1;
    }

    const sequence = nextSequenceRef.current;
    const audioContent = audioChunksRef.current.get(sequence);

    if (!audioContent) {
      if (
        finalSequenceCount !== null &&
        sequence >= finalSequenceCount
      ) {
        setIsPlaybackActive(false);
      }
      return;
    }

    audioChunksRef.current.delete(sequence);
    currentSequenceRef.current = sequence;
    setIsPlaybackActive(true);

    try {
      player.replace(`data:audio/mp3;base64,${audioContent}`);
      player.play();
    } catch (error) {
      console.error(`Error playing TTS audio chunk ${sequence}:`, error);
      currentSequenceRef.current = null;
      nextSequenceRef.current = sequence + 1;
      setQueueRevision((revision) => revision + 1);
    }
  }, [player, queueRevision]);

  useEffect(() => {
    if (!playerStatus.didJustFinish || currentSequenceRef.current === null) {
      return;
    }

    nextSequenceRef.current = currentSequenceRef.current + 1;
    currentSequenceRef.current = null;
    setQueueRevision((revision) => revision + 1);
  }, [playerStatus.didJustFinish]);

  const clearAudioQueue = useCallback(() => {
    player.pause();
    audioChunksRef.current.clear();
    nextSequenceRef.current = 0;
    currentSequenceRef.current = null;
    finalSequenceCountRef.current = null;
    setIsPlaybackActive(false);
    setQueueRevision((revision) => revision + 1);
  }, [player]);

  const beginAudioStream = useCallback(() => {
    clearAudioQueue();
    setIsPlaybackActive(true);
  }, [clearAudioQueue]);

  const enqueueAudio = useCallback((sequence: number, audioContent: string) => {
    if (sequence < nextSequenceRef.current) return;

    audioChunksRef.current.set(sequence, audioContent);
    setIsPlaybackActive(true);
    setQueueRevision((revision) => revision + 1);
  }, []);

  const finishAudioStream = useCallback((audioChunkCount: number) => {
    finalSequenceCountRef.current = audioChunkCount;
    setQueueRevision((revision) => revision + 1);
  }, []);

  // ─── Mute / Unmute toggle ─────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    player.muted = !player.muted;
  }, [player]);

  const isMuted = playerStatus.mute;

  // ─── Recording permission check ──────────────────────────────────────────

  const checkRecordingPermission = useCallback(async (): Promise<boolean> => {
    const permission = await getRecordingPermissionsAsync();
    if (permission.status !== "granted") {
      const result = await requestRecordingPermissionsAsync();
      if (result.status !== "granted") {
        Alert.alert(
          "Microphone Permission Required",
          "Please enable microphone access in your device settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        return false;
      }
    }
    return true;
  }, []);

  return {
    // Player state
    isPlaying: playerStatus.playing,
    isPlaybackActive,
    isMuted,

    // Actions
    beginAudioStream,
    enqueueAudio,
    finishAudioStream,
    clearAudioQueue,
    toggleMute,
    checkRecordingPermission,
  };
}
