import { prisma } from "../../lib/prisma.ts";

/**
 * Stores duration observations and keeps only the five newest entries for
 * each user/category pair.
 */
export async function saveUserPreferences(userId, categories, duration) {
  return prisma.$transaction(async (tx) => {
    const createdEntries = [];

    for (const category of categories) {
      const newEntry = await tx.categoryEvent.create({
        data: {
          userId,
          category,
          duration,
        },
      });

      const preferences = await tx.categoryEvent.findMany({
        where: { userId, category },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (preferences.length > 5) {
        const idsToDelete = preferences
          .slice(5)
          .map((preference) => preference.id);
        await tx.categoryEvent.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }

      createdEntries.push(newEntry);
    }

    return createdEntries;
  });
}

export async function getUserPreferences(userId, category) {
  return prisma.categoryEvent.findMany({
    where: { userId, category },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllUserPreferences(userId) {
  return prisma.categoryEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
