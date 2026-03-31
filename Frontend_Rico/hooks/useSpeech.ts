import * as Speech from 'expo-speech';
import { useCallback, useRef, useState } from "react";

// ─── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  language: "en-US",
  pitch: 1.0,
  rate: 1.0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip emojis, markdown, and schedule-ready tags so TTS reads cleanly.
 */
function cleanForSpeech(text: string): string {
  return (
    text
      // Remove <SCHEDULE_READY> ... </SCHEDULE_READY> JSON blocks
      .replace(/<SCHEDULE_READY>[\s\S]*?<\/SCHEDULE_READY>/g, "")
      // Remove markdown bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      // Remove markdown headers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove emojis (common unicode ranges)
      .replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu,
        ""
      )
      // Collapse multiple spaces/newlines
      .replace(/\s+/g, " ")
      .trim()
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const currentTextRef = useRef<string | null>(null);

  /**
   * Speak the given text. Stops any in-progress speech first.
   * Respects the mute toggle — does nothing when muted.
   */
  const speak = useCallback(
    (text: string) => {
      if (isMuted) return;

      const cleaned = cleanForSpeech(text);
      if (!cleaned) return;

      // Stop any current speech
      Speech.stop();
      currentTextRef.current = cleaned;

      Speech.speak(cleaned, {
        ...DEFAULT_OPTIONS,
        onStart: () => setIsSpeaking(true),
        onDone: () => {
          setIsSpeaking(false);
          currentTextRef.current = null;
        },
        onError: () => {
          setIsSpeaking(false);
          currentTextRef.current = null;
        },
        onStopped: () => {
          setIsSpeaking(false);
          currentTextRef.current = null;
        },
      });
    },
    [isMuted]
  );

  /**
   * Stop any active speech immediately.
   */
  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
    currentTextRef.current = null;
  }, []);

  /**
   * Toggle mute on/off. Stops speech if muting.
   */
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      if (!prev) {
        // Muting — stop any active speech
        Speech.stop();
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isMuted,
    toggleMute,
  };
}
