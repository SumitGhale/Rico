import {
  DEFAULT_WHISPER_MODEL_ID,
  WHISPER_MODELS,
  useWhisperModel,
} from "@/hooks/useWhisperModel";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
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
    downloadModel,
    deleteModel,
    initializeWhisperModel,
    refreshModelFiles,
  } = useWhisperModel();

  useEffect(() => {
    refreshModelFiles();
  }, [refreshModelFiles]);

  const confirmDelete = (modelId: string, label: string) => {
    Alert.alert(
      "Delete speech model?",
      `${label} will need to be downloaded again before it can be used.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteModel(modelId),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headingRow}>
          <View style={styles.headingIcon}>
            <Ionicons name="hardware-chip-outline" size={24} color="#2563eb" />
          </View>
          <View style={styles.headingText}>
            <Text style={styles.title}>Speech Models</Text>
            <Text style={styles.subtitle}>
              Models run entirely on your device. Base Q5 is recommended for
              better English accuracy.
            </Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {WHISPER_MODELS.map((model) => {
          const fileInfo = modelFiles[model.id];
          const installed = Boolean(fileInfo);
          const active = currentModelId === model.id;
          const selected = selectedModelId === model.id;
          const downloading = downloadingModelId === model.id;
          const busy = downloading || (initializingModel && selected);

          return (
            <View key={model.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.modelNameContainer}>
                  <Text style={styles.modelName}>{model.label}</Text>
                  <Text style={styles.modelDescription}>{model.description}</Text>
                </View>
                <View style={styles.badges}>
                  {model.id === DEFAULT_WHISPER_MODEL_ID && (
                    <View style={[styles.badge, styles.recommendedBadge]}>
                      <Text style={styles.recommendedText}>Recommended</Text>
                    </View>
                  )}
                  {active && (
                    <View style={[styles.badge, styles.activeBadge]}>
                      <Text style={styles.activeText}>Active</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.detailsRow}>
                <Text style={styles.detailText}>
                  {installed
                    ? `Installed · ${formatBytes(fileInfo.size)}`
                    : `Download · about ${formatBytes(model.expectedSize)}`}
                </Text>
                {selected && !active && (
                  <Text style={styles.selectedText}>Selected</Text>
                )}
              </View>

              <View style={styles.actions}>
                {!installed ? (
                  <Pressable
                    disabled={downloadingModelId !== null}
                    onPress={() => downloadModel(model.id)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (pressed || downloadingModelId !== null) && styles.buttonPressed,
                    ]}
                  >
                    {downloading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="cloud-download-outline" size={17} color="#ffffff" />
                        <Text style={styles.primaryButtonText}>Download</Text>
                      </>
                    )}
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      disabled={active || initializingModel || isRecordingActive}
                      onPress={() => initializeWhisperModel(model.id)}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        (active || initializingModel || isRecordingActive || pressed) && styles.buttonPressed,
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {active ? "In use" : "Use model"}
                        </Text>
                      )}
                    </Pressable>

                    <Pressable
                      disabled={active || initializingModel}
                      onPress={() => confirmDelete(model.id, model.label)}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        (active || initializingModel || pressed) && styles.buttonPressed,
                      ]}
                    >
                      <Ionicons name="trash-outline" size={17} color="#dc2626" />
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        })}

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color="#64748b" />
          <Text style={styles.noteText}>
            The active model cannot be deleted. Switch to another downloaded
            model first. Core ML files are not required for this evaluation.
          </Text>
        </View>
      </ScrollView>
      <StatusBar style={Platform.OS === "ios" ? "dark" : "auto"} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 22,
  },
  headingIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headingText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748b",
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  modelNameContainer: {
    flex: 1,
    paddingRight: 8,
  },
  modelName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },
  modelDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748b",
    marginTop: 4,
  },
  badges: {
    alignItems: "flex-end",
    gap: 5,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recommendedBadge: {
    backgroundColor: "#eff6ff",
  },
  recommendedText: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: "700",
  },
  activeBadge: {
    backgroundColor: "#dcfce7",
  },
  activeText: {
    color: "#15803d",
    fontSize: 11,
    fontWeight: "700",
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  detailText: {
    color: "#475569",
    fontSize: 13,
  },
  selectedText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    minHeight: 42,
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  deleteButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  deleteButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.5,
  },
  note: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  noteText: {
    flex: 1,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
  },
});
