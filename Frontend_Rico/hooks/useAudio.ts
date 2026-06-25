import { useCallback, useRef, useState } from "react";
import { useEventListener } from "expo";
import {
  useAudioPlayer,
  setAudioModeAsync,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  type AudioStatus,
} from "expo-audio";
import { Alert, Linking } from "react-native";

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAudio() {
  // Audio Player for TTS. keepAudioSessionActive stops expo-audio from
  // deactivating the iOS audio session on pause/finish — by default it schedules
  // setActive(false, .notifyOthersOnDeactivation) ~0.1s after each pause/chunk,
  // which races the next chunk's setActive(true) and throws "Session activation
  // failed". Keeping the session active across the whole queue removes that race
  // and matches the app-wide persistent PlayAndRecord session set in _layout.tsx.
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });

  const audioChunksRef = useRef(new Map<number, string>());
  const nextSequenceRef = useRef(0);
  const currentSequenceRef = useRef<number | null>(null);
  const finalSequenceCountRef = useRef<number | null>(null);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Imperative pump: if nothing is currently playing, start the next available
  // chunk. Driven entirely off refs so it can be invoked from anywhere — a new
  // chunk arriving, the stream finishing, or the previous chunk ending.
const playNext = useCallback(() => {
    if (currentSequenceRef.current !== null) return;

    const finalSequenceCount = finalSequenceCountRef.current;
    const sequence = nextSequenceRef.current;
    const audioContent = audioChunksRef.current.get(sequence);

    // The expected chunk isn't buffered yet. If the stream has finished and this
    // sequence will never arrive (the server failed its TTS request), skip past
    // it — but only one step, then return so the next enqueue/finish call
    // re-drives the pump. Skipping in a loop here would race ahead of chunks that
    // are merely still in flight and drop them as "already past".
    if (!audioContent) {
      if (finalSequenceCount !== null && sequence < finalSequenceCount) {
        console.log(`[audio] skipping missing chunk ${sequence}`);
        nextSequenceRef.current += 1;
        playNext();
      } else if (finalSequenceCount !== null && sequence >= finalSequenceCount) {
        setIsPlaybackActive(false);
      }
      return;
    }

    audioChunksRef.current.delete(sequence);
    currentSequenceRef.current = sequence;
    setIsPlaybackActive(true);

    const attemptPlay = () => {
      player.replace(`data:audio/mp3;base64,${audioContent}`);
      player.play();
    };

    // Drop the failed chunk and move on. Used after a retry also fails.
    const skipChunk = (error: unknown) => {
      console.error(`Error playing TTS audio chunk ${sequence}:`, error);
      currentSequenceRef.current = null;
      nextSequenceRef.current = sequence + 1;
      playNext();
    };

    try {
      console.log(
        `[audio] playing chunk ${sequence} (${audioContent.length} b64 chars)`
      );
      attemptPlay();
    } catch (error) {
      // A transient session failure (e.g. "Session activation failed") can leave
      // the queue able to recover: re-assert the audio mode to re-activate the
      // session, then retry this same chunk once before dropping it.
      console.warn(
        `[audio] chunk ${sequence} failed; re-activating session and retrying`,
        error
      );
      setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "mixWithOthers",
      })
        .then(() => attemptPlay())
        .catch(skipChunk);
    }
  }, [player]);

  // Advance the queue when the current chunk finishes. We listen to the player's
  // native `playbackStatusUpdate` event via `useEventListener`, which registers
  // the subscription exactly once (it holds the latest callback in a ref) so it
  // is never torn down and re-added mid-event — a manual addListener effect keyed
  // on `playNext` could drop the `didJustFinish` callback right as it fires,
  // stalling the queue after the first sentence.
  // `player as any`: AudioPlayer extends SharedObject/EventEmitter from
  // expo-modules-core, which isn't hoisted to top-level node_modules here, so TS
  // drops the inherited EventEmitter members from the type. The methods exist at
  // runtime via JSI; the callback stays strongly typed via the `status` param.
  useEventListener(player as any, "playbackStatusUpdate", (status: AudioStatus) => {
    setIsPlaying(status.playing);
    setIsMuted(status.mute);

    if (currentSequenceRef.current === null) {
      return;
    }

    if (status.didJustFinish) {
      console.log(`[audio] chunk ${currentSequenceRef.current} finished`);
      nextSequenceRef.current = currentSequenceRef.current + 1;
      currentSequenceRef.current = null;
      // Defer to a fresh tick: issuing native replace()/play() re-entrantly from
      // inside this native status callback gets dropped, so the next chunk never
      // actually starts and the queue stalls.
      setTimeout(playNext, 0);
      return;
    }

    // Play-when-ready safety net: chunks are replaced and played back-to-back, so
    // the synchronous play() in playNext can fire before the freshly-replaced item
    // reaches readyToPlay — playImmediately() then silently no-ops and the chunk
    // stalls (logs "playing chunk N" but never finishes). When the item finishes
    // loading, re-issue play() so it actually starts.
    if (status.isLoaded && !status.playing) {
      player.play();
    }
  });

  const clearAudioQueue = useCallback(() => {
    try {
      player.pause();
    } catch {
      // During screen unmount (e.g. logout) the native player may already be
      // released, so pause() throws NativeSharedObjectNotFoundException. There's
      // nothing to pause in that case — ignore it.
    }
    audioChunksRef.current.clear();
    nextSequenceRef.current = 0;
    currentSequenceRef.current = null;
    finalSequenceCountRef.current = null;
    setIsPlaybackActive(false);
  }, [player]);

  const beginAudioStream = useCallback(() => {
    clearAudioQueue();
    setIsPlaybackActive(true);
  }, [clearAudioQueue]);

  const enqueueAudio = useCallback(
    (sequence: number, audioContent: string) => {
      console.log(
        `[audio] chunk arrived ${sequence} (${audioContent.length} b64 chars)` +
          (sequence < nextSequenceRef.current ? " — DROPPED (already past)" : "")
      );
      if (sequence < nextSequenceRef.current) return;

      audioChunksRef.current.set(sequence, audioContent);
      setIsPlaybackActive(true);
      playNext();
    },
    [playNext]
  );

  const finishAudioStream = useCallback(
    (audioChunkCount: number) => {
      console.log(`[audio] stream finished — total chunks: ${audioChunkCount}`);
      finalSequenceCountRef.current = audioChunkCount;
      playNext();
    },
    [playNext]
  );

  // ─── Mute / Unmute toggle ─────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    player.muted = !player.muted;
    setIsMuted(player.muted);
  }, [player]);

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
    isPlaying,
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
