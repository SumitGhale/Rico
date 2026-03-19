import { useState } from "react";
import { Directory, Paths, File } from "expo-file-system"
import { initWhisper, WhisperContext } from "whisper.rn/index.js";

export interface WhisperModel {
    id: string;
    label: string;
    url: string;
    filename: string;
    capabilities: {
        multilingual: boolean;
        quantizable: boolean;
        tdrz?: boolean; // Optional TDRZ capability for native models
    };
}

export const WHISPER_MODELS: WhisperModel[] = [
    {
        id: "ggml-tiny.en-q5_1",
        label: "Tiny English (Q5_1)",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin",
        filename: "ggml-tiny.en-q5_1.bin",
        capabilities: {
            multilingual: false,
            quantizable: false,
        },
    },
];

interface ModelFileInfo {
    path: string;
    size: number;
}

export function useWhisperModel() {                                                                                                                                                                                                                                                                          
    const [initializingModel, setInitializingModel] = useState(false);
    const [modelFiles, setModelFiles] = useState<Record<string, ModelFileInfo>>(
        {}
    );
    const [isDownloading, setIsDownloading] = useState(false);
    const [currentModelId, setCurrentModelId] = useState<string | null>(null);
    const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);

    async function getModelDirectory() {

        let documentDirectory: Directory;
        try {
            documentDirectory = Paths.document;
        } catch (error) {
            console.log("Error getting or downloading model", error);
            return;
        }
        if (!documentDirectory?.uri) {
            console.log("Error getting or downloading model");
            return;
        }
        const directory = new Directory(documentDirectory, "whisper-models");
        directory.create({ idempotent: true, intermediates: true });
        return directory;
    }

    async function getOrDownloadModel(model: WhisperModel) {
        const directory = await getModelDirectory();
        if (!directory) {
            throw new Error("Failed to get model directory");
        }
        const file = new File(directory, model.filename);

        // Helper to update cache with latest stat info
        const updateModelFileInfo = () => {
            try {
                const stats = file.info();
                if (!stats.exists) throw new Error("File not found");
                setModelFiles((prev) => ({
                    ...prev,
                    [model.id]: {
                        path: file.uri,
                        size: Number(stats.size) || 0,
                    },
                }));
            } catch (statError) {
                console.warn(
                    `Failed to stat model file ${model.id} at ${file.uri}:`,
                    statError
                );
                setModelFiles((prev) => ({
                    ...prev,
                    [model.id]: {
                        path: file.uri,
                        size: 0,
                    },
                }));
            }
        };

        //   check if file already exists
        let existingInfo;
        try {
            existingInfo = file.info();
        } catch (error) {
            console.log("Error getting model info", error);
            existingInfo = { exists: false }
        }
        if (existingInfo.exists) {
            console.log(`Model ${model.id} already exists at ${file.uri}`);
            updateModelFileInfo();
            return file.uri;
        }

        //  download the model
        setIsDownloading(true)
        try {
            console.log(`Downloading ${model.id}...`);
            const downloadedFile = await File.downloadFileAsync(
                model.url,
                file,
                { idempotent: true }
            );
            console.log(`Download complete: ${downloadedFile.uri}`);
            updateModelFileInfo();
            return file.uri;
        } catch (error) {
            console.log("Error downloading model", error);
            throw error;
        } finally {
            setIsDownloading(false);
        }
    }

    async function initializeWhisperModel(modelId: string) {
        const model = WHISPER_MODELS.find((m) => m.id === modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }
        setInitializingModel(true);
        try {
            // get or download model if not available
            const modelPath = await getOrDownloadModel(model);

            // initialize whisper context 
            console.log(`Initializing whisper context for ${modelId}...`);
            const context = await initWhisper({
                filePath: modelPath,
            });

            setCurrentModelId(modelId);
            setWhisperContext(context);
            console.log(`✅ Whisper context initialized for ${modelId}`);
        } catch (error) {
            console.log("Error initializing whisper model", error);
        } finally {
            setInitializingModel(false);
        }
    }

    return {
        initializeWhisperModel,
        initializingModel,
        currentModelId,
        whisperContext,
        isDownloading,
        modelFiles,
    };
}

