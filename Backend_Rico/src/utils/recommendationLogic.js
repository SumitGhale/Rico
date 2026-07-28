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
 * Calculates a recommendation from preferences that are already loaded and
 * ordered newest-first.
 */
export function getRecommendedDurationFromPreferences(preferences) {
  if (!preferences || preferences.length === 0) {
    return null;
  }

  if (preferences.length < 5) {
    return preferences[0].duration;
  }

  return getDurationMode(preferences);
}

/**
 * Recommends an event duration based on user preferences.
 */
export async function getRecommendedDuration(userId, category) {
  const preferences = await getUserPreferences(userId, category);
  return getRecommendedDurationFromPreferences(preferences);
}

// const preferences = [
//   {
//     id: "cmrzwj0mk000bfwsxrinnsg7p",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "shopping",
//     duration: 90,
//     createdAt: "2026-07-25T05:01:24.332Z",
//   },
//   {
//     id: "cmrzwiy9g0009fwsxgdu7aca6",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "exercise",
//     duration: 75,
//     createdAt: "2026-07-25T05:01:21.268Z",
//   },
//   {
//     id: "cmrzwiwxu0007fwsxp1lohgvk",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "work",
//     duration: 150,
//     createdAt: "2026-07-25T05:01:19.554Z",
//   },
//   {
//     id: "cmrywtq62000kcq8oytfwomhk",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "exercise",
//     duration: 60,
//     createdAt: "2026-07-24T12:21:57.818Z",
//   },
//   {
//     id: "cmrywtoh3000icq8o1jie98z8",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "study",
//     duration: 105,
//     createdAt: "2026-07-24T12:21:55.623Z",
//   },
//   {
//     id: "cmrywtmhx000gcq8ovqsqgg7x",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "meals",
//     duration: 30,
//     createdAt: "2026-07-24T12:21:53.061Z",
//   },
//   {
//     id: "cmrywmnej0008cq8omfd0k5at",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "study",
//     duration: 240,
//     createdAt: "2026-07-24T12:16:27.643Z",
//   },
//   {
//     id: "cmrxmdmxr000374sxq4oqglyw",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "work",
//     duration: 480,
//     createdAt: "2026-07-23T14:41:44.799Z",
//   },
//   {
//     id: "cmrwvx0my0000qw8oh1p7hpd0",
//     userId: "cmoskgwub0000kssxmwr1nl0e",
//     category: "exercise",
//     duration: 60,
//     createdAt: "2026-07-23T02:20:59.386Z",
//   },
// ];

export function groupByCategory(preferences) {
  const preferencesByCategory = {};

  for (const preference of preferences) {
    const category = preference.category;

    if (!preferencesByCategory[category]) {
      preferencesByCategory[category] = [];
    }

    preferencesByCategory[category].push(preference);
  }
  return preferencesByCategory;
}
