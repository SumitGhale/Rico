// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScheduleEvent {
  type: "event" | "task" | "reminder";
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration_minutes: number | null;
  priority: "high" | "medium" | "low";
  notes: string | null;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

const SCHEDULE_REGEX =
  /<SCHEDULE_READY>\s*([\s\S]*?)\s*<\/SCHEDULE_READY>/;

/**
 * Extract and parse the <SCHEDULE_READY> JSON block from a model response.
 * Returns the parsed array of events, or `null` if not found / invalid.
 */
export function parseScheduleBlock(text: string): ScheduleEvent[] | null {
  const match = text.match(SCHEDULE_REGEX);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as ScheduleEvent[];
  } catch {
    console.warn("Failed to parse SCHEDULE_READY JSON:", match[1]);
    return null;
  }
}

/**
 * Strip the <SCHEDULE_READY> block from the display text so users
 * don't see raw JSON in the chat bubble.
 */
export function stripScheduleBlock(text: string): string {
  return text.replace(SCHEDULE_REGEX, "").trim();
}
