import * as SecureStore from "expo-secure-store";
import { Alert } from "react-native";
import { BACKEND_URL } from "@/constants/Gemini";
import { throwIfRateLimited } from "@/services/apiError";

const AUTH_BASE = `${BACKEND_URL}/api/auth`;
const TOKEN_KEY = "rico_auth_token";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ─── Token Storage ────────────────────────────────────────────────────────────

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// A process-wide slot holding one callback. The React layer (AuthProvider)
// registers its logout logic here so plain modules can trigger a logout without
// importing React state. null until something registers a handler.
let unauthorizedHandler: (() => void) | null = null;

/**
 * Register what should happen when a request reveals the token is no longer valid
 * (e.g. AuthProvider passes `() => setUser(null)`). Pass `null` to unregister.
 */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

// Guards against stacking multiple alerts when several requests 401 at once.
let unauthorizedNoticeVisible = false;

/**
 * Call when any authenticated request returns 401. Clears the dead token, shows
 * a "session expired" notice, and on OK fires the registered handler so the app
 * resets to a logged-out state. Idempotent — safe to call from multiple 401 sites.
 */
export const handleUnauthorizedToken = async (): Promise<void> => {
  await clearToken();

  // If a notice is already up (parallel requests all 401'd), don't stack more.
  if (unauthorizedNoticeVisible) return;
  unauthorizedNoticeVisible = true;

  Alert.alert(
    "Session expired",
    "Your session has expired. Please sign in again.",
    [
      {
      text: "OK",
        onPress: () => {
          unauthorizedNoticeVisible = false;
          unauthorizedHandler?.();
        },
      },
    ],
    { cancelable: false }
  );
};

/**
 * Returns authorization headers with the stored JWT token.
 * Use this in all authenticated API calls.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ─── API Calls ────────────────────────────────────────────────────────────────

/**
 * Register a new user with email and password.
 */
export async function register(
  email: string,
  password: string,
  name?: string
): Promise<AuthResponse> {
  const res = await fetch(`${AUTH_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok) {
    // Rate-limit responses are plain text, so parse the body defensively.
    throwIfRateLimited(res);
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Registration failed");
  }

  const data = await res.json();

  // Persist the token
  await saveToken(data.token);
  return data;
}

/**
 * Log in with email and password.
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    // Rate-limit responses are plain text, so parse the body defensively.
    throwIfRateLimited(res);
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Login failed");
  }

  const data = await res.json();

  // Persist the token
  await saveToken(data.token);
  return data;
}

/**
 * Fetch the current user profile using the stored token.
 * Returns null if the token is missing or invalid.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const headers = await getAuthHeaders();
  if (!headers.Authorization) return null;

  try {
    const res = await fetch(`${AUTH_BASE}/me`, {
      headers,
    });

    // A 429 says nothing about token validity — don't clear it, just surface it
    // so the caller can back off rather than silently logging the user out.
    throwIfRateLimited(res);

    if (!res.ok) {
      // Token is invalid or expired — clear it
      await clearToken();
      return null;
    }

    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function deleteMyAccount(): Promise<void> {
  const headers = await getAuthHeaders();
  if (!headers.Authorization) throw new Error("No auth token found");

  const res = await fetch(`${AUTH_BASE}/me`, {
    method: "DELETE",
    headers,
  });

  if (!res.ok) {
    // Rate-limit responses are plain text, so parse the body defensively.
    throwIfRateLimited(res);
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to delete account");
  }

  // Clear the token after successful deletion
  await clearToken();
}

/**
 * Log out — clears the stored token.
 */
export async function logout(): Promise<void> {
  await clearToken();
}
