import * as SecureStore from "expo-secure-store";
import { Directory, File, Paths } from "expo-file-system";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { initWhisper, WhisperContext } from "whisper.rn/index.js";

export interface WhisperModel {
    id: string;
    label: string;
    url: string;
    filename: string;
    description: string;
    expectedSize: number;
    capabilities: {
        multilingual: boolean;
        quantizable: boolean;
        tdrz?: boolean;
    };
}

export const DEFAULT_WHISPER_MODEL_ID = "ggml-base.en-q5_1";
const SELECTED_MODEL_KEY = "rico_selected_whisper_model";

export const WHISPER_MODELS: WhisperModel[] = [
    {
        id: DEFAULT_WHISPER_MODEL_ID,
        label: "Base English (Q5_1)",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin",
        filename: "ggml-base.en-q5_1.bin",
        description: "Recommended balance of English accuracy and mobile performance.",
        expectedSize: 59_700_000,
        capabilities: {
            multilingual: false,
            quantizable: false,
        },
    },
    {
        id: "ggml-tiny.en-q5_1",
        label: "Tiny English (Q5_1)",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin",
        filename: "ggml-tiny.en-q5_1.bin",
        description: "Smaller and faster, but less accurate for accents, names, and times.",
        expectedSize: 32_200_000,
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

interface WhisperModelContextValue {
    initializeWhisperModel: (modelId?: string) => Promise<boolean>;
    downloadModel: (modelId: string) => Promise<boolean>;
    deleteModel: (modelId: string) => Promise<boolean>;
    refreshModelFiles: () => Promise<void>;
    selectedModelId: string;
    currentModelId: string | null;
    whisperContext: WhisperContext | null;
    initializingModel: boolean;
    downloadingModelId: string | null;
    isDownloading: boolean;
    preferencesLoaded: boolean;
    isRecordingActive: boolean;
    setVoiceRecordingActive: (active: boolean) => void;
    modelFiles: Record<string, ModelFileInfo>;
    error: string | null;
}

const WhisperModelContext = createContext<WhisperModelContextValue | null>(null);

function getModel(modelId: string): WhisperModel {
    const model = WHISPER_MODELS.find((candidate) => candidate.id === modelId);
    if (!model) {
        throw new Error(`Model ${modelId} not found`);
    }
    return model;
}

function getModelDirectory(): Directory {
    const directory = new Directory(Paths.document, "whisper-models");
    directory.create({ idempotent: true, intermediates: true });
    return directory;
}

export function WhisperModelProvider({ children }: { children: React.ReactNode }) {
    const [initializingModel, setInitializingModel] = useState(false);
    const [modelFiles, setModelFiles] = useState<Record<string, ModelFileInfo>>({});
    const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
    const [selectedModelId, setSelectedModelId] = useState(DEFAULT_WHISPER_MODEL_ID);
    const [currentModelId, setCurrentModelId] = useState<string | null>(null);
    const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);
    const [preferencesLoaded, setPreferencesLoaded] = useState(false);
    const [isRecordingActive, setIsRecordingActive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const initializationPromiseRef = useRef<Promise<boolean> | null>(null);
    const initializationTargetRef = useRef<string | null>(null);
    const recordingActiveRef = useRef(false);

    const setVoiceRecordingActive = useCallback((active: boolean) => {
        recordingActiveRef.current = active;
        setIsRecordingActive(active);
    }, []);

    const refreshModelFiles = useCallback(async () => {
        try {
            const directory = getModelDirectory();
            const installed: Record<string, ModelFileInfo> = {};
            for (const model of WHISPER_MODELS) {
                const file = new File(directory, model.filename);
                const info = file.info();
                if (info.exists) {
                    installed[model.id] = {
                        path: file.uri,
                        size: Number(info.size) || 0,
                    };
                }
            }
            setModelFiles(installed);
        } catch (refreshError) {
            console.warn("Failed to inspect Whisper models:", refreshError);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const savedModelId = await SecureStore.getItemAsync(SELECTED_MODEL_KEY);
                if (
                    !cancelled &&
                    savedModelId &&
                    WHISPER_MODELS.some((model) => model.id === savedModelId)
                ) {
                    setSelectedModelId(savedModelId);
                }
                await refreshModelFiles();
            } finally {
                if (!cancelled) setPreferencesLoaded(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [refreshModelFiles]);

    useEffect(() => {
        return () => {
            whisperContext?.release().catch(console.warn);
        };
    }, [whisperContext]);

    const getOrDownloadModel = useCallback(async (model: WhisperModel) => {
        const directory = getModelDirectory();
        const file = new File(directory, model.filename);
        setError(null);
        const existingInfo = file.info();
        if (existingInfo.exists) {
            return file.uri;
        }

        setDownloadingModelId(model.id);
        setError(null);
        try {
            console.log(`Downloading ${model.id}...`);
            const downloadedFile = await File.downloadFileAsync(
                model.url,
                file,
                { idempotent: true }
            );
            console.log(`Download complete: ${downloadedFile.uri}`);
            await refreshModelFiles();
            return file.uri;
        } catch (downloadError) {
            const message =
                downloadError instanceof Error
                    ? downloadError.message
                    : "Failed to download speech model";
            setError(message);
            throw downloadError;
        } finally {
            setDownloadingModelId(null);
        }
    }, [refreshModelFiles]);

    const downloadModel = useCallback(async (modelId: string) => {
        try {
            await getOrDownloadModel(getModel(modelId));
            return true;
        } catch {
            return false;
        }
    }, [getOrDownloadModel]);

    const initializeWhisperModel = useCallback(async (modelId = selectedModelId) => {
        if (modelId === currentModelId && whisperContext) return true;
        if (recordingActiveRef.current) {
            setError("End the current voice recording before switching models.");
            return false;
        }
        if (initializationPromiseRef.current) {
            if (initializationTargetRef.current === modelId) {
                return initializationPromiseRef.current;
            }
            return false;
        }

        const model = getModel(modelId);
        const initialization = (async () => {
            setInitializingModel(true);
            setError(null);
            try {
                const modelPath = await getOrDownloadModel(model);
                console.log(`Initializing whisper context for ${modelId}...`);
                const nextContext = await initWhisper({
                    filePath: modelPath,
                    useGpu: true,
                    useCoreMLIos: false,
                });

                setWhisperContext(nextContext);
                setCurrentModelId(modelId);
                setSelectedModelId(modelId);
                await SecureStore.setItemAsync(SELECTED_MODEL_KEY, modelId);
                console.log(`Whisper context initialized for ${modelId}`);
                return true;
            } catch (initializationError) {
                const message =
                    initializationError instanceof Error
                        ? initializationError.message
                        : "Failed to initialize speech model";
                console.warn("Error initializing Whisper model:", initializationError);
                setError(message);
                return false;
            } finally {
                setInitializingModel(false);
                initializationPromiseRef.current = null;
                initializationTargetRef.current = null;
            }
        })();

        initializationTargetRef.current = modelId;
        initializationPromiseRef.current = initialization;
        return initialization;
    }, [currentModelId, getOrDownloadModel, selectedModelId, whisperContext]);

    const deleteModel = useCallback(async (modelId: string) => {
        if (modelId === currentModelId) {
            setError("Switch to another downloaded model before deleting the active model.");
            return false;
        }

        try {
            setError(null);
            const model = getModel(modelId);
            const file = new File(getModelDirectory(), model.filename);
            if (file.exists) file.delete();
            await refreshModelFiles();
            return true;
        } catch (deleteError) {
            const message =
                deleteError instanceof Error
                    ? deleteError.message
                    : "Failed to delete speech model";
            setError(message);
            return false;
        }
    }, [currentModelId, refreshModelFiles]);

    const value = useMemo<WhisperModelContextValue>(() => ({
        initializeWhisperModel,
        downloadModel,
        deleteModel,
        refreshModelFiles,
        selectedModelId,
        initializingModel,
        currentModelId,
        whisperContext,
        downloadingModelId,
        isDownloading: downloadingModelId !== null,
        preferencesLoaded,
        isRecordingActive,
        setVoiceRecordingActive,
        modelFiles,
        error,
    }), [
        currentModelId,
        deleteModel,
        downloadModel,
        downloadingModelId,
        error,
        initializeWhisperModel,
        isRecordingActive,
        modelFiles,
        preferencesLoaded,
        refreshModelFiles,
        selectedModelId,
        setVoiceRecordingActive,
        whisperContext,
    ]);

    return (
        <WhisperModelContext.Provider value={value}>
            {children}
        </WhisperModelContext.Provider>
    );
}

export function useWhisperModel(): WhisperModelContextValue {
    const context = useContext(WhisperModelContext);
    if (!context) {
        throw new Error("useWhisperModel must be used inside WhisperModelProvider");
    }
    return context;
}
