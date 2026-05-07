import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
  const [name, setName] = useState("");
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
    if (password.length < 6) return "Password must be at least 6 characters";
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
        await register(email.trim(), password, name.trim() || undefined);
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
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ─── Header / Brand ─────────────────────────────────────── */}
          <View className="items-center pt-24 pb-10">
            {/* App icon */}
            <View className="w-20 h-20 rounded-3xl bg-blue-600 items-center justify-center mb-5 shadow-lg">
              <Ionicons name="chatbubble-ellipses" size={40} color="#ffffff" />
            </View>
            <Text className="text-white text-4xl font-bold tracking-tight">
              Rico
            </Text>
            <Text className="text-gray-400 text-base mt-2">
              Your AI scheduling assistant
            </Text>
          </View>

          {/* ─── Card ───────────────────────────────────────────────── */}
          <View className="mx-6 bg-gray-900 rounded-3xl px-6 py-8 border border-gray-800">
            {/* Mode title */}
            <Text className="text-white text-2xl font-bold mb-1">
              {isLogin ? "Welcome back" : "Create account"}
            </Text>
            <Text className="text-gray-400 text-sm mb-6">
              {isLogin
                ? "Sign in to continue to Rico"
                : "Sign up to get started with Rico"}
            </Text>

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

            {/* ─── Name field (register only) ─────────────────────── */}
            {!isLogin && (
              <View className="mb-4">
                <Text className="text-gray-300 text-sm font-medium mb-2 ml-1">
                  Name
                </Text>
                <View className="flex-row items-center bg-gray-800 border border-gray-700 rounded-xl px-4">
                  <Ionicons name="person-outline" size={18} color="#9ca3af" />
                  <TextInput
                    className="flex-1 text-white text-base py-3.5 ml-3"
                    placeholder="Your name (optional)"
                    placeholderTextColor="#6b7280"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
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
                    isLogin ? "Enter your password" : "Min. 6 characters"
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
