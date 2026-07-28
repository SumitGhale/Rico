import { ai, GEMINI_MODEL } from "../config/gemini.js";
import { getRecommendedDuration } from "./recommendationLogic.js";

/**
 * A broad list of 20 category buckets for grouping events.
 */
export const EVENT_CATEGORIES = [
  "exercise", // gym, workout, running, cycling, sports, yoga, swimming
  "work", // meetings, office work, client calls, emails
  "side_projects", // coding, building apps, startup ideas, writing blogs
  "study", // reading, classes, homework, online courses, tutorials
  "meals", // breakfast, lunch, dinner, snack, dining out
  "chores", // cleaning, laundry, cooking, washing dishes, vacuuming
  "shopping", // grocery shopping, retail, errands
  "social", // hanging out with friends, calls, parties, events
  "leisure", // gaming, watching TV/movies, relaxation, browsing
  "health", // doctor appointments, dentist, therapy, pharmacy
  "self_care", // meditation, skincare, massage, mindfulness
  "hobbies", // painting, playing music, photography, crafting
  "sleep", // night sleep, afternoon naps, bedtime routine
  "commute", // driving, public transit, traveling, walking to work
  "family", // family dinners, helping parents, kids' activities
  "finance", // budgeting, paying bills, banking, taxes
  "admin", // scheduling, organizing files, planning the week
  "maintenance", // car service, home repairs, device updates
  "pet_care", // walking the dog, feeding pets, vet visits
  "spiritual", // prayer, attending services, meditation
];

// separate, focused system prompt — no scheduling context at all
const CATEGORIZATION_SYSTEM_PROMPT = `
    You are a strict event classifier. Given an event title,       
  classify it into one or more of the following categories:        
    ${EVENT_CATEGORIES.join(", ")}
  
    Guidelines:
    - Return a valid JSON array of category names.
    - If an event fits multiple categories, include all matching   
  categories in the array.
    - Do not include any extra text, explanation, or markdown      
  backticks outside the JSON array.
  
    Examples:
    "Gym workout & cardio" -> ["exercise"]
    "Team sync with engineering" -> ["work"]
    "Grocery shopping at Trader Joe's" -> ["shopping"]             
    "Dinner with parents" -> ["family", "social"]
    "Doctor appointment" -> ["health"]
    "Gym workout and team health checkup" -> ["exercise", "work",  
  "health"]
    `;

// creating a llm for event categorisation
async function createChat() {
  return ai.chats.create({
    model: GEMINI_MODEL,
    config: { systemInstruction: CATEGORIZATION_SYSTEM_PROMPT },
  });
}
export async function categorizeEvent(eventTitle) {
  const chat = await createChat();
  const response = await chat.sendMessage({
    message: eventTitle,
  });
  const text = (response.text || "").replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Remove duplicates and filter out invalid categories.
    return [
      ...new Set(
        parsed.filter(
          (category) =>
            typeof category === "string" && EVENT_CATEGORIES.includes(category),
        ),
      ),
    ];
  } catch {
    return [];
  }
}

// Get the recommended duration for a given category based on user preferences.
export async function getRecommendationMessage(userId) {
  try {
    const preferences = await getAllUserPreferences(userId);
    const preferencesByCategory = groupByCategory(preferences);
    const recommendedDurations = new Map();

    for (const [category, categoryPreferences] of Object.entries(
      preferencesByCategory,
    )) {
      const duration =
        getRecommendedDurationFromPreferences(categoryPreferences);

      if (duration !== null) {
        recommendedDurations.set(category, duration);
      }
    }

    if (recommendedDurations.size === 0) {
      return "";
    }

    const durationLines = [...recommendedDurations.entries()]
      .sort(([leftCategory], [rightCategory]) =>
        leftCategory.localeCompare(rightCategory),
      )
      .map(([category, duration]) => `- ${category}: ~${duration} minutes`)
      .join("\n");

    return `## Recommended Event Durations Based on User Preferences
These recommendations were learned from the categories and durations of the
user's past events:
${durationLines}

When a requested event clearly matches one of these categories, use its
recommended duration as the default. A duration explicitly provided by the
user always takes priority. Do not mention these internal category names.`;
  } catch (error) {
    console.warn(
      "Duration recommendation lookup failed; continuing without it:",
      error,
    );
    return "";
  }
}
