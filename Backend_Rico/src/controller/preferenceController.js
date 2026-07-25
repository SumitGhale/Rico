import {
  categorizeEvent,
  EVENT_CATEGORIES,
} from "../utils/eventCategorisation.js";
import { saveUserPreferences } from "../services/preferenceService.js";

/**
 * Adds a user preference to DB and ensures max 5 preferences per category per user.
 * Called when a new event is created. called from eventController.js after creating an event.
 */
export async function addUserPreference(userId, eventTitle, start, end) {
  const duration = (new Date(end) - new Date(start)) / (1000 * 60); // duration in minutes
  let categories = [];
  try {
    categories = await categorizeEvent(eventTitle);
  } catch (error) {
    console.error("Error categorizing event:", error);
    throw new Error("Failed to categorize event");
  }

  if (!categories || categories.length === 0) {
    return [];
  }

  const validCategories = categories.filter((category) => {
    if (EVENT_CATEGORIES.includes(category)) {
      return true;
    }

    console.warn(
      `Category "${category}" is not in the predefined list. Skipping.`,
    );
    return false;
  });

  if (validCategories.length === 0) {
    return [];
  }

  try {
    return await saveUserPreferences(userId, validCategories, duration);
  } catch (error) {
    console.error("Error adding user preferences:", error);
    throw new Error("Failed to add user preferences");
  }
}
