import React, { createContext, useCallback, useContext, useState } from "react";
import type { EventItem } from "@howljs/calendar-kit";
import type { ScheduleEvent } from "@/utils/parseSchedule";

// ─── Context ─────────────────────────────────────────────────────────────────

interface CalendarEventsContextValue {
  events: EventItem[];
  addEvents: (items: ScheduleEvent[]) => void;
  addDragEvent: (event: EventItem) => void;
  updateEvent: (id: string, start: EventItem["start"], end: EventItem["end"]) => void;
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

/** Convert a ScheduleEvent (Gemini schema) → EventItem (calendar-kit). */
function toEventItem(evt: ScheduleEvent, index: number): EventItem {
  const [hours, minutes] = evt.time.split(":").map(Number);
  const startDate = new Date(`${evt.date}T00:00:00`);
  startDate.setHours(hours, minutes, 0, 0);

  const durationMs = (evt.duration_minutes ?? 60) * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  return {
    id: `gemini-${Date.now()}-${index}`,
    title: evt.title,
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() },
    color: colorForType(evt.type),
  };
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function CalendarEventsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<EventItem[]>([]);

  /** Add events from a Gemini SCHEDULE_READY block. */
  const addEvents = useCallback((items: ScheduleEvent[]) => {
    const converted = items.map(toEventItem);
    setEvents((prev) => [...prev, ...converted]);
  }, []);

  /** Add a single event from drag-to-create in the calendar UI. */
  const addDragEvent = useCallback((event: EventItem) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  /** Update an event's time (from drag-to-edit). */
  const updateEvent = useCallback(
    (id: string, start: EventItem["start"], end: EventItem["end"]) => {
      setEvents((prev) =>
        prev.map((ev) => (ev.id === id ? { ...ev, start, end } : ev))
      );
    },
    []
  );

  return React.createElement(
    CalendarEventsContext.Provider,
    { value: { events, addEvents, addDragEvent, updateEvent } },
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
