import { categorizeEvent } from "../utils/eventCategorisation.js";
import { prisma } from "../lib/prisma.ts";

/**
 * Adds a user preference to DB and ensures max 5 preferences per category per user.
 * Called when a new event is created. called from eventController.js after creating an event.
 */
export async function addUserPreference(userId, eventTitle, start, end) {
  const duration = (new Date(end) - new Date(start)) / (1000 * 60); // duration in minutes
  const category = await categorizeEvent(eventTitle);

  // Use a Prisma transaction to perform creation and max-5 cleanup atomically (all-or-nothing - prisma transaction combines multiple queries into a single transaction and ensures that either all succeed or fall back if any fail)
  const addedPreference = await prisma.$transaction(async (tx) => {
    // 1. Create the new preference record
    const newEntry = await tx.userPreference.create({
      data: {
        userId,
        eventTitle,
        category,
        duration,
      },
    });

    // 2. Fetch all preferences for this user + category, ordered newest to oldest
    const preferences = await tx.userPreference.findMany({
      where: { userId, category },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    // 3. Keep top 5 newest entries; delete any 6th+ older entries
    if (preferences.length > 5) {
      const idsToDelete = preferences.slice(5).map((p) => p.id);
      await tx.userPreference.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return newEntry;
  });

  return addedPreference;
}