import { getUserPreferences } from "../services/preferenceService.js";

/**
 * Calculates the mode (most frequent duration) from an array of CategoryEvent objects.
 */
function getDurationMode(events) {
  const frequencyMap = {};
  let maxCount = 0;
  let modeDuration = events[0].duration;

  for (const event of events) {
    const duration = event.duration;
    frequencyMap[duration] = (frequencyMap[duration] || 0) + 1;

    if (frequencyMap[duration] > maxCount) {
      maxCount = frequencyMap[duration];
      modeDuration = duration;
    }
  }

  return modeDuration;
}

/**
 * Recommends an event duration based on user preferences.
 */
export async function getRecommendedDuration(userId, category) {
  const preferences = await getUserPreferences(userId, category);

  if (!preferences || preferences.length === 0) {
    return null;
  }

  if (preferences.length < 5) {
    return preferences[0].duration;
  }

  return getDurationMode(preferences);
}
