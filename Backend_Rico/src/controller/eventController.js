import { prisma } from "../../lib/prisma.ts";

// ─── Create Event ────────────────────────────────────────────────────────────
export const createEvent = async (req, res) => {
  try {
    const { title, start, end, color } = req.body;

    if (!title || !start || !end) {
      return res.status(400).json({ error: "title, start, and end are required" });
    }

    const event = await prisma.event.create({
      data: {
        title,
        start: new Date(start),
        end: new Date(end),
        ...(color && { color }),
      },
    });

    res.status(201).json(event);
  } catch (err) {
    console.error("Create event error:", err);
    res.status(500).json({ error: err?.message || "Failed to create event" });
  }
};

// ─── Get All Events ──────────────────────────────────────────────────────────
export const getAllEvents = async (_req, res) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { start: "asc" },
    });

    res.json(events);
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

    const event = await prisma.event.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(start && { start: new Date(start) }),
        ...(end && { end: new Date(end) }),
        ...(color && { color }),
      },
    });

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

    await prisma.event.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete event error:", err);
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Event not found" });
    }
    res.status(500).json({ error: err?.message || "Failed to delete event" });
  }
};
