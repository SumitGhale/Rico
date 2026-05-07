import { prisma } from "../../lib/prisma.ts";

/**
 * Saves (or updates) OAuth tokens in the GoogleToken table.
 * Uses upsert with id="default" for single-user mode.
 */
export async function saveTokensToDB(tokens) {
  console.log("Saving tokens to DB:", tokens);
  await prisma.googleToken.upsert({
    where: { id: "default" },
    update: {
      accessToken: tokens.access_token,
      ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
      expiryDate: BigInt(tokens.expiry_date ?? 0),
    },
    create: {
      id: "default",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? "",
      expiryDate: BigInt(tokens.expiry_date ?? 0),
    },
  });
}

/**
 * Loads tokens from DB and returns them, or null if none exist.
 */
export async function loadTokensFromDB() {
  try {
    const row = await prisma.googleToken.findUnique({ where: { id: "default" } });
    if (!row) return null;
    return {
      access_token: row.accessToken,
      refresh_token: row.refreshToken,
      expiry_date: Number(row.expiryDate),
    };
  } catch {
    return null;
  }
}
 
// ─── Token Refresh & Calendar API ────────────────────────────────────────────

const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL;
const GOOGLE_CALENDAR_API = process.env.GOOGLE_CALENDAR_API;

/**
 * Returns a valid access token, refreshing if expired.
 * Uses the iOS client ID (PKCE / public client — no client_secret needed).
 * Returns null if no tokens are stored.
 */
export async function getValidAccessToken() {
  const tokens = await loadTokensFromDB();
  if (!tokens) return null;

  // If the token hasn't expired yet, return it as-is.
  // (5-minute buffer to avoid edge-case expiry during the API call)
  const isExpired = Date.now() >= tokens.expiry_date - 5 * 60 * 1000;

  if (!isExpired) {
    return tokens.access_token;
  }

  // ─── Refresh the token ────────────────────────────────────────────────
  if (!tokens.refresh_token) {
    console.warn("Access token expired but no refresh token available");
    return null;
  }

  const clientId = process.env.GOOGLE_IOS_CLIENT_ID;
  if (!clientId) {
    console.error("GOOGLE_IOS_CLIENT_ID not set in .env — cannot refresh token");
    return null;
  }

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Token refresh failed:", data);
      
      // If the grant is invalid/revoked, delete it from the DB so the user is "disconnected"
      if (data.error === "invalid_grant") {
        const { prisma } = await import("../../lib/prisma.ts");
        await prisma.googleToken.deleteMany({ where: { id: "default" } });
      }
      return null;
    }

    // Save the refreshed tokens back to DB
    await saveTokensToDB({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? tokens.refresh_token, // Google may not return a new refresh token
      expiry_date: data.expires_in
        ? Date.now() + data.expires_in * 1000
        : 0,
    });

    return data.access_token;
  } catch (err) {
    console.error("Token refresh error:", err);
    return null;
  }
}

/**
 * Fetches events from the user's primary Google Calendar.
 * Returns an empty array if not connected or on failure.
 *
 * @param {string} [timeMin] - ISO date-time for the start of the range (default: 30 days ago)
 * @param {string} [timeMax] - ISO date-time for the end of the range (default: 30 days from now)
 */
export async function fetchGoogleCalendarEvents(timeMin, timeMax) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return [];

  // Default to ±30 days
  const now = new Date();
  const defaultMin = new Date(now);
  defaultMin.setDate(defaultMin.getDate() - 30);
  const defaultMax = new Date(now);
  defaultMax.setDate(defaultMax.getDate() + 30);

  const params = new URLSearchParams({
    timeMin: timeMin ?? defaultMin.toISOString(),
    timeMax: timeMax ?? defaultMax.toISOString(),
    singleEvents: "true",   // expand recurring events
    orderBy: "startTime",
    maxResults: "250",
  });

  try {
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("Google Calendar API error:", res.status, errData);
      return [];
    }

    const data = await res.json();

    // Normalize Google events to match the local event shape
    return (data.items ?? [])
      .filter((e) => e.start?.dateTime) // skip all-day events for now
      .map((e) => ({
        id: `gcal-${e.id}`,
        googleCalendarId: e.id,
        title: e.summary ?? "(No title)",
        start: e.start.dateTime,
        end: e.end.dateTime,
        color: "#4285F4",       // Google blue
        source: "google",
        createdAt: e.created,
        updatedAt: e.updated,
      }));
  } catch (err) {
    console.error("Failed to fetch Google Calendar events:", err);
    return [];
  }
}

/**
 * Creates an event on the user's primary Google Calendar.
 * Returns the Google Calendar event ID on success, or null on failure.
 *
 * @param {{ title: string, start: string, end: string, description?: string }} event
 * @returns {Promise<string | null>} The Google Calendar event ID, or null
 */
export async function createGoogleCalendarEvent(event) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  try {
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/primary/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: event.title,
          start: { dateTime: event.start, timeZone: event.timeZone ?? "UTC" },
          end: { dateTime: event.end, timeZone: event.timeZone ?? "UTC" },
          ...(event.description && { description: event.description }),
        }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("Google Calendar insert error:", res.status, errData);
      return null;
    }

    const data = await res.json();
    console.log("Created Google Calendar event:", data.id);
    return data.id;
  } catch (err) {
    console.error("Failed to create Google Calendar event:", err);
    return null;
  }
}

/**
 * Updates an existing event on the user's primary Google Calendar.
 * Returns true on success, false on failure.
 *
 * @param {string} googleEventId - The Google Calendar event ID to update
 * @param {{ title?: string, start?: string, end?: string, description?: string, timeZone?: string }} updates
 * @returns {Promise<boolean>}
 */
export async function updateGoogleCalendarEvent(googleEventId, updates) {
  if (!googleEventId) return false;

  const accessToken = await getValidAccessToken();
  if (!accessToken) return false;

  try {
    const body = {};
    if (updates.title) body.summary = updates.title;
    if (updates.start) body.start = { dateTime: updates.start, timeZone: updates.timeZone ?? "UTC" };
    if (updates.end) body.end = { dateTime: updates.end, timeZone: updates.timeZone ?? "UTC" };
    if (updates.description) body.description = updates.description;

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/primary/events/${googleEventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("Google Calendar update error:", res.status, errData);
      return false;
    }

    console.log("Updated Google Calendar event:", googleEventId);
    return true;
  } catch (err) {
    console.error("Failed to update Google Calendar event:", err);
    return false;
  }
}

/**
 * Deletes an event from the user's primary Google Calendar.
 * Returns true on success, false on failure.
 *
 * @param {string} googleEventId - The Google Calendar event ID to delete
 * @returns {Promise<boolean>}
 */
export async function deleteGoogleCalendarEvent(googleEventId) {
  if (!googleEventId) return false;

  const accessToken = await getValidAccessToken();
  if (!accessToken) return false;

  try {
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/primary/events/${googleEventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    // Google returns 204 No Content on successful delete
    if (!res.ok && res.status !== 204) {
      const errData = await res.json().catch(() => ({}));
      console.error("Google Calendar delete error:", res.status, errData);
      return false;
    }

    console.log("Deleted Google Calendar event:", googleEventId);
    return true;
  } catch (err) {
    console.error("Failed to delete Google Calendar event:", err);
    return false;
  }
}
