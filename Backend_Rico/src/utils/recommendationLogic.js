import { getUserPreferences } from "../controller/preferenceController.js";

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
    // When no preferences found
    console.log(`No preferences found for userId: ${userId} and category: ${category}`);
    return null;
  } else if (preferences.length < 5) {
    // When preferences are less than 5, use the most recent preference duration
    return preferences[0].duration;
  } else {
    // When preferences equal 5, calculate and return the mode of the durations
    return getDurationMode(preferences);
  }
}

const recommendedDuration = await getRecommendedDuration("cmoskgwub0000kssxmwr1nl0e", "exercise");
console.log(`Recommended duration for userId: cmoskgwub0000kssxmwr1nl0e and category: exercise is ${recommendedDuration}`);