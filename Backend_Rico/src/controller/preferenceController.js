import {
  categorizeEvent,
  EVENT_CATEGORIES,
} from "../utils/eventCategorisation.js";
import { prisma } from "../../lib/prisma.ts";

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

  // Use a Prisma transaction to perform creation and max-5 cleanup atomically per category
  try {
    const addedPreferences = await prisma.$transaction(async (tx) => {
      const createdEntries = [];

      for (const cat of categories) {
        // Validate category against predefined list
        if (!EVENT_CATEGORIES.includes(cat)) {
          console.warn(
            `Category "${cat}" is not in the predefined list. Skipping.`,
          );
          continue;
        }
        // 1. Create the new preference record for this category
        const newEntry = await tx.categoryEvent.create({
          data: {
            userId,
            category: cat,
            duration,
          },
        });

        // 2. Fetch all preferences for this user + category, ordered newest to oldest
        const preferences = await tx.categoryEvent.findMany({
          where: { userId, category: cat },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        // 3. Keep top 5 newest entries; delete any 6th+ older entries
        if (preferences.length > 5) {
          const idsToDelete = preferences.slice(5).map((p) => p.id);
          await tx.categoryEvent.deleteMany({
            where: { id: { in: idsToDelete } },
          });
        }

        createdEntries.push(newEntry);
      }

      return createdEntries;
    });

    return addedPreferences;
  } catch (error) {
    console.error("Error adding user preferences:", error);
    throw new Error("Failed to add user preferences");
  }
}

// get all user preferences for a given userId and category for testing
// await addUserPreference("cmoskgwub0000kssxmwr1nl0e", "Gym workout & cardio", "2024-06-01T07:00:00Z", "2024-06-01T08:00:00Z");

// get all user preferences for a given userId and category
export async function getUserPreferences(userId, category) {
  try {
    const preferences = await prisma.categoryEvent.findMany({
      where: { userId, category },
      orderBy: { createdAt: "desc" },
    });
    return preferences;
  } catch (error) {
    console.error("Error fetching user preferences:", error);
    throw new Error("Failed to fetch user preferences");
  }
}
