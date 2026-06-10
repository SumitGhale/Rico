import * as AuthSession from "expo-auth-session";
import { BACKEND_URL } from "@/constants/Gemini";
import { getAuthHeaders } from "./authService";

const AUTH_BASE = `${BACKEND_URL}/api/auth`;  

// ─── Google OAuth Config ──────────────────────────────────────────────────────
// The iOS client ID from Google Cloud Console (iOS application type).
// The Web client ID is only used by the backend (stored in credentials.json).
//
// To get the iOS client ID:
//   1. Google Cloud Console → Credentials → Create OAuth Client ID → iOS
//   2. Bundle ID: com.sumitghale.Rico
//   3. Copy the client ID below
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID as string;

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// Google's OAuth endpoints (discovery document).
const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectionStatus {
  connected: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reverses a Google client ID to get the iOS URL scheme.
 * e.g. "1234-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.1234-abc"
 */
function reverseClientId(clientId: string): string {
  return clientId.split(".").reverse().join(".");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Checks whether the backend already has saved Google OAuth tokens.
 * Call this on app load to show the correct UI state.
 */
export async function checkGoogleConnectionStatus(): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${AUTH_BASE}/google/status`, { headers });
    if (!res.ok) return false;
    const data: ConnectionStatus = await res.json();
    return data.connected;
  } catch {
    return false;
  }
}

/**
 * Opens the Google OAuth consent flow using expo-auth-session.
 *
 * Flow:
 *  1. Builds the redirect URI from the reversed iOS client ID
 *     (e.g. com.googleusercontent.apps.1234-abc:/oauthredirect)
 *  2. Creates an AuthRequest with PKCE for security
 *  3. Opens Google's consent screen in an in-app browser
 *  4. User logs in and clicks "Allow"
 *  5. Google redirects to the reversed-client-ID scheme → iOS opens our app
 *  6. expo-auth-session captures the authorization code
 *  7. We POST the code to the backend's /exchange endpoint
 *  8. Backend exchanges the code for tokens and saves them to DB
 *
 * @returns true if successfully connected, false otherwise
 */
export async function connectGoogleCalendar(): Promise<boolean> {
  try {
    // Build redirect URI: com.googleusercontent.apps.{CLIENT_ID}:/oauthredirect
    const reversedId = reverseClientId(GOOGLE_IOS_CLIENT_ID);
    const redirectUri = `${reversedId}:/oauthredirect`;

    // Create the auth request with PKCE (Proof Key for Code Exchange).
    const request = new AuthSession.AuthRequest({
      clientId: GOOGLE_IOS_CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      usePKCE: true,
      extraParams: {
        access_type: "offline", // request a refresh_token
        prompt: "consent",      // always show consent (ensures refresh_token)
      },
    });

    // Open the consent screen. This returns when the user completes or cancels.
    const result = await request.promptAsync(GOOGLE_DISCOVERY);

    if (result.type !== "success" || !result.params.code) {
      return false;
    }

    // Send the authorization code to the backend for token exchange.
    // We also send the redirectUri and codeVerifier so the backend can
    // complete the PKCE exchange with Google's token endpoint.
    const headers = await getAuthHeaders();
    const exchangeRes = await fetch(`${AUTH_BASE}/google/exchange`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        code: result.params.code,
        redirectUri,
        codeVerifier: request.codeVerifier,
      }),
    });

    if (!exchangeRes.ok) {
      const errData = await exchangeRes.json().catch(() => ({}));
      throw new Error(errData.error ?? "Failed to exchange code for tokens");
    }

    return true;
  } catch (err) {
    console.error("Google Calendar connection failed:", err);
    return false;
  }
}

/**
 * Disconnects Google Calendar by calling the backend revoke endpoint.
 * (Phase 1 only clears the local status — full revoke can be added later)
 */
export async function disconnectGoogleCalendar(): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${AUTH_BASE}/google/disconnect`, { method: "DELETE", headers });
}
