import { BACKEND_URL } from "@/constants/Gemini";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape returned by the backend for a stored event. */
export interface BackendEvent {
  id: string;
  title: string;
  start: string; // ISO date-time
  end: string;   // ISO date-time
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating a new event. */
export interface CreateEventPayload {
  title: string;
  start: string; // ISO date-time
  end: string;   // ISO date-time
  color?: string;
}

/** Payload for updating an event (all fields optional). */
export interface UpdateEventPayload {
  title?: string;
  start?: string;
  end?: string;
  color?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVENTS_URL = `${BACKEND_URL}/api/events`;

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ─── Service Functions ───────────────────────────────────────────────────────

/** Fetch all events from the backend, ordered by start date. */
export async function fetchAllEvents(): Promise<BackendEvent[]> {
  const res = await fetch(EVENTS_URL);
  return handleResponse<BackendEvent[]>(res);
}

/** Create a single event in the database. */
export async function createEvent(payload: CreateEventPayload): Promise<BackendEvent> {
  const res = await fetch(EVENTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<BackendEvent>(res);
}

/** Create multiple events in the database (sequential calls). */
export async function createManyEvents(payloads: CreateEventPayload[]): Promise<BackendEvent[]> {
  const results: BackendEvent[] = [];
  for (const payload of payloads) {
    const event = await createEvent(payload);
    results.push(event);
  }
  return results;
}

/** Update an existing event by ID. */
export async function updateEventById(
  id: string,
  payload: UpdateEventPayload
): Promise<BackendEvent> {
  const res = await fetch(`${EVENTS_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<BackendEvent>(res);
}

/** Delete an event by ID. */
export async function deleteEventById(id: string): Promise<void> {
  const res = await fetch(`${EVENTS_URL}/${id}`, { method: "DELETE" });
  await handleResponse<{ success: boolean }>(res);
}
