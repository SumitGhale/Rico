export function getUserFriendlyError(code?: string) {
  switch (code) {
    case "AI_UNAVAILABLE":
      return "Rico is having trouble connecting right now.";

    case "AI_RATE_LIMITED":
      return "Rico is a little busy right now. Try again shortly.";

    case "NETWORK_ERROR":
      return "You appear to be offline. Check your connection.";

    default:
      return "Something went wrong. Please try again.";
  }
}