export function normalizeGeminiError(error) {
  if (error?.status === 503) {
    return {
      code: "AI_UNAVAILABLE",
      status: 503,
    };
  }

  if (error?.status === 429) {
    return {
      code: "AI_RATE_LIMITED",
      status: 429,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    status: 500,
  };
}