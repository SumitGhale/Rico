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

export interface ScheduleUpdate {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration_minutes: number | null;
}

export interface ScheduleDelete {
  id: string;
  title: string;
}

// ─── Regexes ─────────────────────────────────────────────────────────────────

const SCHEDULE_REGEX =
  /<SCHEDULE_READY>\s*([\s\S]*?)\s*<\/SCHEDULE_READY>/;

const UPDATE_REGEX =
  /<SCHEDULE_UPDATE>\s*([\s\S]*?)\s*<\/SCHEDULE_UPDATE>/;

const DELETE_REGEX =
  /<SCHEDULE_DELETE>\s*([\s\S]*?)\s*<\/SCHEDULE_DELETE>/;

// ─── Generic Parser ──────────────────────────────────────────────────────────

function parseBlock<T>(text: string, regex: RegExp, label: string): T[] | null {
  const match = text.match(regex);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as T[];
  } catch {
    console.warn(`Failed to parse ${label} JSON:`, match[1]);
    return null;
  }
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Extract and parse the <SCHEDULE_READY> JSON block from a model response.
 * Returns the parsed array of events, or `null` if not found / invalid.
 */
export function parseScheduleBlock(text: string): ScheduleEvent[] | null {
  return parseBlock<ScheduleEvent>(text, SCHEDULE_REGEX, "SCHEDULE_READY");
}

/**
 * Extract and parse the <SCHEDULE_UPDATE> JSON block.
 * Returns the parsed array of updates, or `null` if not found / invalid.
 */
export function parseScheduleUpdateBlock(text: string): ScheduleUpdate[] | null {
  return parseBlock<ScheduleUpdate>(text, UPDATE_REGEX, "SCHEDULE_UPDATE");
}

/**
 * Extract and parse the <SCHEDULE_DELETE> JSON block.
 * Returns the parsed array of deletes, or `null` if not found / invalid.
 */
export function parseScheduleDeleteBlock(text: string): ScheduleDelete[] | null {
  return parseBlock<ScheduleDelete>(text, DELETE_REGEX, "SCHEDULE_DELETE");
}

// ─── Strippers ───────────────────────────────────────────────────────────────

/**
 * Strip all schedule blocks from the display text so users
 * don't see raw JSON in the chat bubble.
 */
export function stripScheduleBlock(text: string): string {
  return text
    .replace(SCHEDULE_REGEX, "")
    .replace(UPDATE_REGEX, "")
    .replace(DELETE_REGEX, "")
    .trim();
}
