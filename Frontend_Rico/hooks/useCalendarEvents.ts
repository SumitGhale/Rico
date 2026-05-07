import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { EventItem } from "@howljs/calendar-kit";
import type { ScheduleEvent, ScheduleUpdate, ScheduleDelete } from "@/utils/parseSchedule";
import {
  fetchAllEvents,
  createEvent,
  createManyEvents,
  updateEventById,
  deleteManyEvents,
  type BackendEvent,
} from "@/services/eventService";

// ─── Context ─────────────────────────────────────────────────────────────────

interface CalendarEventsContextValue {
  events: EventItem[];
  loading: boolean;
  addEvents: (items: ScheduleEvent[]) => void;
  addDragEvent: (event: EventItem) => void;
  updateEvent: (id: string, start: EventItem["start"], end: EventItem["end"]) => void;
  updateEvents: (updates: ScheduleUpdate[]) => Promise<void>;
  deleteEvents: (deletes: ScheduleDelete[]) => Promise<void>;
  refreshEvents: () => Promise<void>;
}

const CalendarEventsContext = createContext<CalendarEventsContextValue | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map event type to a colour for the calendar view. */
function colorForType(type: ScheduleEvent["type"]): string {
  switch (type) {
    case "event":
      return "#3b82f6"; // blue
    case "task":
      return "#22c55e"; // green
    case "reminder":
      return "#f59e0b"; // amber
    default:
      return "#6b7280";
  }
}

/** Convert a BackendEvent (DB row) → EventItem (calendar-kit). */
function toEventItem(evt: BackendEvent): EventItem {
  const isGoogle = evt.source === "google";
  return {
    id: evt.id,
    title: isGoogle ? `📅 ${evt.title}` : evt.title,
    start: { dateTime: evt.start },
    end: { dateTime: evt.end },
    color: evt.color ?? "#6b7280",
    draggable: !isGoogle, // Google events are read-only
  };
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function CalendarEventsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  /** Fetch all events from the backend and sync local state. */
  const refreshEvents = useCallback(async () => {
    try {
      setLoading(true);
      const backendEvents = await fetchAllEvents();
      setEvents(backendEvents.map(toEventItem));
    } catch (err) {
      console.error("Failed to fetch events:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load events from DB on mount
  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  /** Add events from a Gemini SCHEDULE_READY block → saves to DB. */
  const addEvents = useCallback(
    async (items: ScheduleEvent[]) => {
      try {
        const payloads = items.map((evt, _index) => {
          const [hours, minutes] = evt.time.split(":").map(Number);
          const startDate = new Date(`${evt.date}T00:00:00`);
          startDate.setHours(hours, minutes, 0, 0);

          const durationMs = (evt.duration_minutes ?? 60) * 60 * 1000;
          const endDate = new Date(startDate.getTime() + durationMs);

          return {
            title: evt.title,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            color: colorForType(evt.type),
          };
        });

        const created = await createManyEvents(payloads);
        setEvents((prev) => [...prev, ...created.map(toEventItem)]);
      } catch (err) {
        console.error("Failed to create events:", err);
      }
    },
    []
  );

  /** Add a single event from drag-to-create in the calendar UI → saves to DB. */
  const addDragEvent = useCallback(async (event: EventItem) => {
    try {
      const created = await createEvent({
        title: event.title ?? "New Event",
        start: event.start.dateTime!,
        end: event.end.dateTime!,
        color: event.color as string | undefined,
      });
      // Use the DB-generated ID so future updates target the real record
      setEvents((prev) => [...prev, toEventItem(created)]);
    } catch (err) {
      console.error("Failed to create drag event:", err);
    }
  }, []);

  /** Update an event's time (from drag-to-edit) → updates DB. */
  const updateEvent = useCallback(
    async (id: string, start: EventItem["start"], end: EventItem["end"]) => {
      // Google Calendar events are read-only
      if (typeof id === "string" && id.startsWith("gcal-")) return;

      // Optimistic UI update
      setEvents((prev) =>
        prev.map((ev) => (ev.id === id ? { ...ev, start, end } : ev))
      );

      try {
        await updateEventById(id, {
          start: start.dateTime,
          end: end.dateTime,
        });
      } catch (err) {
        console.error("Failed to update event:", err);
        // Revert on failure by re-fetching
        refreshEvents();
      }
    },
    [refreshEvents]
  );

  /** Update events from a Gemini SCHEDULE_UPDATE block → updates DB. */
  const updateEvents = useCallback(
    async (updates: ScheduleUpdate[]) => {
      try {
        for (const upd of updates) {
          const [hours, minutes] = upd.time.split(":").map(Number);
          const startDate = new Date(`${upd.date}T00:00:00`);
          startDate.setHours(hours, minutes, 0, 0);

          const durationMs = (upd.duration_minutes ?? 60) * 60 * 1000;
          const endDate = new Date(startDate.getTime() + durationMs);

          await updateEventById(upd.id, {
            title: upd.title,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          });
        }
        // Refresh from DB to get the updated state
        await refreshEvents();
      } catch (err) {
        console.error("Failed to update events:", err);
      }
    },
    [refreshEvents]
  );

  /** Delete events from a Gemini SCHEDULE_DELETE block → removes from DB. */
  const deleteEvents = useCallback(
    async (deletes: ScheduleDelete[]) => {
      try {
        await deleteManyEvents(deletes.map((d) => d.id));
        // Remove from local state immediately
        const deletedIds = new Set(deletes.map((d) => d.id));
        setEvents((prev) => prev.filter((ev) => !deletedIds.has(ev.id as string)));
      } catch (err) {
        console.error("Failed to delete events:", err);
      }
    },
    []
  );

  return React.createElement(
    CalendarEventsContext.Provider,
    { value: { events, loading, addEvents, addDragEvent, updateEvent, updateEvents, deleteEvents, refreshEvents } },
    children
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCalendarEvents() {
  const ctx = useContext(CalendarEventsContext);
  if (!ctx) {
    throw new Error("useCalendarEvents must be used within CalendarEventsProvider");
  }
  return ctx;
}
