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

  // Track whether we're expecting / actively playing TTS audio
  // (guards against the race where playerStatus.playing is still false while audio loads)
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);

  // ─── Clear isPlaybackActive when playback truly finishes ──────────────────

  useEffect(() => {
    if (!playerStatus.playing && isPlaybackActive) {
      // Player was active and has now stopped — playback finished
      console.log("🔊 Playback finished");
      setIsPlaybackActive(false);
    }
  }, [playerStatus.playing, isPlaybackActive]);

  // ─── Play base64-encoded TTS audio ────────────────────────────────────────

  const playAudio = useCallback(
    async (base64AudioContent: string) => {
      try {
        // Mark playback as active BEFORE calling play()
        // so the auto-restart effect won't fire during audio load
        setIsPlaybackActive(true);
        player.replace(`data:audio/mp3;base64,${base64AudioContent}`);
        player.play();
      } catch (err) {
        console.error("Error playing TTS audio:", err);
        setIsPlaybackActive(false);
      }
    },
    [player]
  );

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
    playAudio,
    toggleMute,
    checkRecordingPermission,
  };
}
