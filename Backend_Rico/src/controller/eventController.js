import { prisma } from "../../lib/prisma.ts";
import {
  fetchGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "../services/googleCalendarService.js";

// ─── Create Event ────────────────────────────────────────────────────────────
export const createEvent = async (req, res) => {
  try {
    const { title, start, end, color } = req.body;

    if (!title || !start || !end) {
      return res.status(400).json({ error: "title, start, and end are required" });
    }

    // 1. Create the event locally in the DB
    let event = await prisma.event.create({
      data: {
        title,
        start: new Date(start),
        end: new Date(end),
        ...(color && { color }),
      },
    });

    // 2. If Google Calendar is connected, also create it there
    const googleEventId = await createGoogleCalendarEvent({
      title,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    });

    // 3. If the Google insert succeeded, save the Google event ID locally
    if (googleEventId) {
      event = await prisma.event.update({
        where: { id: event.id },
        data: { googleEventId },
      });
    }

    res.status(201).json(event);
  } catch (err) {
    console.error("Create event error:", err);
    res.status(500).json({ error: err?.message || "Failed to create event" });
  }
};

// ─── Get All Events ──────────────────────────────────────────────────────────
export const getAllEvents = async (_req, res) => {
  try {
    // 1. Fetch local events from DB
    const localEvents = await prisma.event.findMany({
      orderBy: { start: "asc" },
    });

    // Tag local events with source
    const taggedLocal = localEvents.map((e) => ({
      ...e,
      source: "local",
    }));

    // 2. Fetch Google Calendar events (returns [] if not connected)
    const googleEvents = await fetchGoogleCalendarEvents();

    // 3. Deduplicate: remove Google events that already exist locally
    //    (matched by googleEventId on the local event)
    const localGoogleIds = new Set(
      localEvents
        .filter((e) => e.googleEventId)
        .map((e) => e.googleEventId)
    );

    const uniqueGoogleEvents = googleEvents.filter(
      (ge) => !localGoogleIds.has(ge.googleCalendarId)
    );

    // 4. Merge and sort by start time
    const merged = [...taggedLocal, ...uniqueGoogleEvents].sort(
      (a, b) => new Date(a.start) - new Date(b.start)
    );

    res.json(merged);
  } catch (err) {
    console.error("Get events error:", err);
    res.status(500).json({ error: err?.message || "Failed to fetch events" });
  }
};

// ─── Update Event ────────────────────────────────────────────────────────────
export const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start, end, color } = req.body;

    // 1. Update the event locally
    const event = await prisma.event.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(start && { start: new Date(start) }),
        ...(end && { end: new Date(end) }),
        ...(color && { color }),
      },
    });

    // 2. If this event is linked to Google Calendar, update it there too
    if (event.googleEventId) {
      await updateGoogleCalendarEvent(event.googleEventId, {
        ...(title && { title }),
        ...(start && { start: new Date(start).toISOString() }),
        ...(end && { end: new Date(end).toISOString() }),
      });
    }

    res.json(event);
  } catch (err) {
    console.error("Update event error:", err);
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Event not found" });
    }
    res.status(500).json({ error: err?.message || "Failed to update event" });
  }
};

// ─── Delete Event ────────────────────────────────────────────────────────────
export const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch the event first to check for a Google Calendar link
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // 2. If linked to Google Calendar, delete it there first
    if (event.googleEventId) {
      await deleteGoogleCalendarEvent(event.googleEventId);
    }

    // 3. Delete locally
    await prisma.event.delete({ where: { id } });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete event error:", err);
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Event not found" });
    }
    res.status(500).json({ error: err?.message || "Failed to delete event" });
  }
};
