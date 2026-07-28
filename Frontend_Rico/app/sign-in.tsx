import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type AuthMode = "login" | "register";

export default function SignInScreen() {
  const { login, register } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLogin = mode === "login";

  // ─── Validation ───────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Enter a valid email address";
    if (!password) return "Password is required";
    if (!isLogin && password.length < 8)
      return "Password must be at least 8 characters";
    return null;
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Toggle Mode ──────────────────────────────────────────────────────────

  const toggleMode = () => {
    setMode(isLogin ? "register" : "login");
    setError(null);
  };

  return (
    <View className="flex-1 bg-gray-950">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingVertical: 48,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-md self-center">
            <Image
              source={require("@/assets/images/icon.png")}
              className="w-28 h-28 rounded-[28px] self-center mb-12"
              resizeMode="contain"
              accessibilityLabel="Rico logo"
            />

            {/* ─── Error ──────────────────────────────────────────── */}
            {error && (
              <View className="bg-red-900/40 border border-red-700/50 rounded-xl px-4 py-3 mb-4 flex-row items-center">
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color="#f87171"
                  style={{ marginRight: 8 }}
                />
                <Text className="text-red-300 text-sm flex-1">{error}</Text>
              </View>
            )}

            {/* ─── Email field ────────────────────────────────────── */}
            <View className="mb-4">
              <Text className="text-gray-300 text-sm font-medium mb-2 ml-1">
                Email
              </Text>
              <View className="flex-row items-center bg-gray-800 border border-gray-700 rounded-xl px-4">
                <Ionicons name="mail-outline" size={18} color="#9ca3af" />
                <TextInput
                  className="flex-1 text-white text-base py-3.5 ml-3"
                  placeholder="you@example.com"
                  placeholderTextColor="#6b7280"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (error) setError(null);
                  }}
                  autoFocus={true}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                />
              </View>
            </View>

            {/* ─── Password field ─────────────────────────────────── */}
            <View className="mb-6">
              <Text className="text-gray-300 text-sm font-medium mb-2 ml-1">
                Password
              </Text>
              <View className="flex-row items-center bg-gray-800 border border-gray-700 rounded-xl px-4">
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color="#9ca3af"
                />
                <TextInput
                  className="flex-1 text-white text-base py-3.5 ml-3"
                  placeholder={
                    isLogin ? "Enter your password" : "Min. 8 characters"
                  }
                  placeholderTextColor="#6b7280"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (error) setError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#9ca3af"
                  />
                </Pressable>
              </View>
            </View>

            {/* ─── Submit Button ──────────────────────────────────── */}
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              className={`rounded-xl py-4 items-center justify-center ${
                isSubmitting ? "bg-blue-800" : "bg-blue-600 active:bg-blue-700"
              }`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white text-base font-semibold">
                  {isLogin ? "Sign In" : "Create Account"}
                </Text>
              )}
            </Pressable>

            {/* ─── Toggle mode ────────────────────────────────────── */}
            <View className="flex-row justify-center mt-6">
              <Text className="text-gray-400 text-sm">
                {isLogin
                  ? "Don't have an account? "
                  : "Already have an account? "}
              </Text>
              <Pressable onPress={toggleMode} hitSlop={8}>
                <Text className="text-blue-400 text-sm font-semibold">
                  {isLogin ? "Sign Up" : "Sign In"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
