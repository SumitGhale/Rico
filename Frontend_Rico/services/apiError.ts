// ─── API Error Helpers ────────────────────────────────────────────────────────
// Shared utilities for turning backend error responses into typed errors the UI
// can present nicely. Currently focused on 429 (rate limited) responses emitted
// by the backend's express-rate-limit middleware, which sends standard
// `RateLimit-*` / `Retry-After` headers.

/**
 * Thrown when the backend responds with HTTP 429. Its `message` is already a
 * user-facing string, so screens that render `err.message` directly (sign-in,
 * chat banner) will show something sensible without special-casing.
 */
export class RateLimitError extends Error {
  /** Seconds until the caller may retry, if the server told us. null if unknown. */
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null) {
    super(buildRateLimitMessage(retryAfterSeconds));
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Reads how long until the client may retry from a 429 response.
 * Prefers `Retry-After` (delta-seconds or an HTTP date), then falls back to the
 * draft-standard `RateLimit-Reset` (delta-seconds). Returns null if neither is
 * present or parseable.
 */
export function parseRetryAfter(res: Response): number | null {
  const retryAfter = res.headers.get("Retry-After");
  if (retryAfter) {
    const asSeconds = Number(retryAfter);
    if (Number.isFinite(asSeconds)) return Math.max(0, Math.ceil(asSeconds));

    // Retry-After may also be an HTTP date.
    const asDate = Date.parse(retryAfter);
    if (Number.isFinite(asDate)) {
      return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
    }
  }

  const reset = res.headers.get("RateLimit-Reset");
  if (reset) {
    const asSeconds = Number(reset);
    if (Number.isFinite(asSeconds)) return Math.max(0, Math.ceil(asSeconds));
  }

  return null;
}

/**
 * If `res` is a 429, throw a `RateLimitError` (reading retry timing from the
 * headers). No-op otherwise. Call this from every response-handling site.
 */
export function throwIfRateLimited(res: Response): void {
  if (res.status === 429) {
    throw new RateLimitError(parseRetryAfter(res));
  }
}

/** Formats a friendly "try again in …" message from a retry delay in seconds. */
function buildRateLimitMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds == null || retryAfterSeconds <= 0) {
    return "You're doing that too fast. Please wait a moment and try again.";
  }

  if (retryAfterSeconds < 60) {
    const unit = retryAfterSeconds === 1 ? "second" : "seconds";
    return `You're doing that too fast. Please try again in ${retryAfterSeconds} ${unit}.`;
  }

  const minutes = Math.ceil(retryAfterSeconds / 60);
  const unit = minutes === 1 ? "minute" : "minutes";
  return `You're doing that too fast. Please try again in ${minutes} ${unit}.`;
}
