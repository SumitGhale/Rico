// @ts-expect-error — the package ships type declarations under the wrong module name
import LiveAudioStream from "@fugood/react-native-audio-pcm-stream";
import { Buffer } from "buffer";
import type {
    AudioStreamConfig,
    AudioStreamData,
    AudioStreamInterface,
} from "whisper.rn/realtime-transcription/index.js";

/**
 * Replacement for whisper.rn's stock AudioPcmStreamAdapter, which clears its
 * onData/onError/onStatusChange callbacks when initialize() is called on an
 * already-initialized instance. The voice pipeline reuses this adapter across
 * recording sessions, so callbacks must survive initialize/release.
 */
export class PcmAudioStreamAdapter implements AudioStreamInterface {
    private recording = false;

    private config: AudioStreamConfig | null = null;

    private dataCallback?: (data: AudioStreamData) => void;

    private errorCallback?: (error: string) => void;

    private statusCallback?: (isRecording: boolean) => void;

    async initialize(config: AudioStreamConfig): Promise<void> {
        this.config = config;
        LiveAudioStream.init({
            sampleRate: config.sampleRate || 16000,
            channels: config.channels || 1,
            bitsPerSample: config.bitsPerSample || 16,
            audioSource: config.audioSource ?? 6,
            bufferSize: config.bufferSize || 16 * 1024,
            wavFile: "",
        });
        // LiveAudioStream.on removes any previous listener before adding, so
        // re-subscribing on every initialize is safe.
        LiveAudioStream.on("data", (base64Data: string) => {
            this.handleAudioData(base64Data);
        });
    }

    async start(): Promise<void> {
        if (this.recording) return;
        LiveAudioStream.start();
        this.recording = true;
        this.statusCallback?.(true);
    }

    async stop(): Promise<void> {
        if (!this.recording) return;
        await LiveAudioStream.stop();
        this.recording = false;
        this.statusCallback?.(false);
    }

    isRecording(): boolean {
        return this.recording;
    }

    onData(callback: (audioStreamData: AudioStreamData) => void): void {
        this.dataCallback = callback;
    }

    onError(callback: (error: string) => void): void {
        this.errorCallback = callback;
    }

    onStatusChange(callback: (isRecording: boolean) => void): void {
        this.statusCallback = callback;
    }

    async release(): Promise<void> {
        if (this.recording) {
            await this.stop();
        }
        // Intentionally keep callbacks because the voice pipeline reuses this
        // adapter across recording sessions.
    }

    private handleAudioData(base64Data: string): void {
        if (!this.dataCallback) return;
        try {
            const bytes = Buffer.from(base64Data, "base64");
            this.dataCallback({
                data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
                sampleRate: this.config?.sampleRate || 16000,
                channels: this.config?.channels || 1,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.errorCallback?.(
                error instanceof Error ? error.message : "Audio processing error",
            );
        }
    }
}
