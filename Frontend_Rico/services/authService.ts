import * as SecureStore from "expo-secure-store";
import { BACKEND_URL } from "@/constants/Gemini";

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

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Registration failed");
  }

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

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Login failed");
  }

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

/**
 * Log out — clears the stored token.
 */
export async function logout(): Promise<void> {
  await clearToken();
}
