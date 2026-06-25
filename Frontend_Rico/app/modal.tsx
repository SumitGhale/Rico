import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_WHISPER_MODEL_ID,
  WHISPER_MODELS,
  useWhisperModel,
} from "@/hooks/useWhisperModel";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default function ModalScreen() {
  const {
    currentModelId,
    selectedModelId,
    modelFiles,
    downloadingModelId,
    initializingModel,
    isRecordingActive,
    error,
    deleteModel,
    initializeWhisperModel,
    refreshModelFiles,
  } = useWhisperModel();
  const { user, logout } = useAuth();
  const [selectingModelId, setSelectingModelId] = useState<string | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    refreshModelFiles();
  }, [refreshModelFiles]);

  const selectModel = async (modelId: string) => {
    if (modelId === currentModelId || selectingModelId) return;

    setSelectingModelId(modelId);
    try {
      await initializeWhisperModel(modelId);
    } finally {
      setSelectingModelId(null);
    }
  };

  const confirmDelete = (modelId: string, label: string) => {
    Alert.alert(
      "Delete speech model?",
      `${label} will need to be downloaded again before it can be used.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingModelId(modelId);
            try {
              await deleteModel(modelId);
            } finally {
              setDeletingModelId(null);
            }
          },
        },
      ]
    );
  };

  const confirmLogout = () => {
    Alert.alert("Log out?", "You'll need to sign in again to use Rico.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            await logout();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const actionsBlocked = initializingModel || selectingModelId !== null;

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView contentContainerClassName="px-5 pb-10 pt-5">
        <View className="mb-6 flex-row items-start">
          <View className="mr-3 h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
            <Ionicons name="hardware-chip-outline" size={24} color="#2563eb" />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-slate-900">
              Speech Models
            </Text>
            <Text className="mt-1 text-sm leading-5 text-slate-500">
              Models run entirely on your device. Base Q5 is recommended for
              better English accuracy.
            </Text>
          </View>
        </View>

        {isRecordingActive && (
          <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <Text className="text-[13px] text-amber-800">
              End the current voice recording before switching speech models.
            </Text>
          </View>
        )}

        {error && (
          <View className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <Text className="text-[13px] text-red-700">{error}</Text>
          </View>
        )}

        {WHISPER_MODELS.map((model) => {
          const fileInfo = modelFiles[model.id];
          const installed = Boolean(fileInfo);
          const active = currentModelId === model.id;
          const selected = selectedModelId === model.id;
          const downloading = downloadingModelId === model.id;
          const selecting = selectingModelId === model.id;
          const deleting = deletingModelId === model.id;
          const selectionDisabled =
            active || actionsBlocked || isRecordingActive || deletingModelId !== null;

          return (
            <View
              key={model.id}
              className={`mb-4 rounded-2xl border bg-white p-4 ${
                active ? "border-green-300" : "border-slate-200"
              }`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-[17px] font-bold text-slate-900">
                    {model.label}
                  </Text>
                  <Text className="mt-1 text-[13px] leading-[18px] text-slate-500">
                    {model.description}
                  </Text>
                </View>

                <View className="items-end gap-1">
                  {model.id === DEFAULT_WHISPER_MODEL_ID && (
                    <View className="rounded-full bg-blue-50 px-2 py-1">
                      <Text className="text-[11px] font-bold text-blue-600">
                        Recommended
                      </Text>
                    </View>
                  )}
                  {active && (
                    <View className="rounded-full bg-green-100 px-2 py-1">
                      <Text className="text-[11px] font-bold text-green-700">
                        Active
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="mt-4 flex-row items-center justify-between">
                <Text className="text-[13px] text-slate-600">
                  {installed
                    ? `Installed · ${formatBytes(fileInfo.size)}`
                    : `Download · about ${formatBytes(model.expectedSize)}`}
                </Text>
                {selected && !active && (
                  <Text className="text-xs font-semibold text-blue-600">
                    Saved choice
                  </Text>
                )}
              </View>

              <View className="mt-4 flex-row gap-2.5">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    active
                      ? `${model.label} is active`
                      : `Use ${model.label}`
                  }
                  disabled={selectionDisabled}
                  onPress={() => selectModel(model.id)}
                  className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-xl px-3.5 ${
                    selectionDisabled ? "bg-blue-300" : "bg-blue-600"
                  }`}
                >
                  {selecting || downloading ? (
                    <>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text className="text-sm font-bold text-white">
                        {downloading ? "Downloading..." : "Loading..."}
                      </Text>
                    </>
                  ) : (
                    <>
                      {!installed && (
                        <Ionicons
                          name="cloud-download-outline"
                          size={17}
                          color="#ffffff"
                        />
                      )}
                      <Text className="text-sm font-bold text-white">
                        {active
                          ? "In use"
                          : installed
                            ? "Use model"
                            : "Download & use"}
                      </Text>
                    </>
                  )}
                </Pressable>

                {installed && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${model.label}`}
                    disabled={active || actionsBlocked || deletingModelId !== null}
                    onPress={() => confirmDelete(model.id, model.label)}
                    className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl px-3.5 ${
                      active || actionsBlocked || deletingModelId !== null
                        ? "bg-red-50 opacity-40"
                        : "bg-red-50"
                    }`}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color="#dc2626" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={17} color="#dc2626" />
                        <Text className="text-sm font-bold text-red-600">
                          Delete
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        <View className="mt-1 flex-row gap-2 rounded-xl bg-slate-100 p-3">
          <Ionicons name="information-circle-outline" size={18} color="#64748b" />
          <Text className="flex-1 text-xs leading-[17px] text-slate-500">
            Selecting a model downloads it when needed and makes it active. The
            active model cannot be deleted; switch to another model first.
          </Text>
        </View>

        <View className="mt-8 border-t border-slate-200 pt-5">
          {user?.email && (
            <Text className="mb-3 text-center text-xs text-slate-400">
              Signed in as {user.email}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            disabled={loggingOut}
            onPress={confirmLogout}
            className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 ${
              loggingOut ? "opacity-40" : ""
            }`}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color="#dc2626" />
                <Text className="text-sm font-bold text-red-600">Log out</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
      <StatusBar style={Platform.OS === "ios" ? "dark" : "auto"} />
    </View>
  );
}
