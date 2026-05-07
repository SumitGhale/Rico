import {
  loadTokensFromDB,
  saveTokensToDB,
} from "../services/googleCalendarService.js";

export const exchangeGoogleToken = async (req, res) => {
  const { code, redirectUri, codeVerifier } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing authorization code" });
  }
  if (!redirectUri || typeof redirectUri !== "string") {
    return res.status(400).json({ error: "Missing redirectUri" });
  }

  try {
    // Exchange the authorization code for tokens via Google's token endpoint.
    // For iOS (public client) we use PKCE instead of client_secret.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        // Extract the iOS client_id from the reversed redirectUri scheme
        client_id: redirectUri.replace(":/oauthredirect", "").split(".").reverse().join("."),
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", tokenData);
      return res.status(400).json({ error: tokenData.error_description ?? "Token exchange failed" });
    }

    // Save tokens to DB (same format as the existing flow)
    await saveTokensToDB({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : 0,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Token exchange error:", err);
    res.status(500).json({ error: "Failed to exchange authorization code" });
  }
};

export const getGoogleAuthStatus = async (_req, res) => {
  try {
    const tokens = await loadTokensFromDB();
    res.json({ connected: !!tokens });
  } catch (err) {
    console.error("Failed to check auth status:", err);
    res.status(500).json({ error: "Failed to check connection status" });
  }
};

export const disconnectGoogleAuth = async (_req, res) => {
  try {
    const { prisma } = await import("../../lib/prisma.ts");
    await prisma.googleToken.deleteMany({ where: { id: "default" } });
    res.json({ disconnected: true });
  } catch (err) {
    console.error("Failed to disconnect:", err);
    res.status(500).json({ error: "Failed to disconnect Google Calendar" });
  }
};
