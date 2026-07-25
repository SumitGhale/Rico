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
            typeof category === "string" &&
            EVENT_CATEGORIES.includes(category),
        ),
      ),
    ];
  } catch {
    return [];
  }
}

/*                                                                 
     * Categorizes user prompt and retrieves recommended durations for  
    all detected categories.                                              
*/
export async function getPromptRecommendationsContext(userId, userPrompt) {
  // 1. Get array of categories from user prompt using existing categorizer;
  const categories = await categorizeEvent(userPrompt);

  if (!categories || categories.length === 0) {
    return null;
  }

  // 2. Fetch recommended durations for all categories concurrently
  const results = await Promise.all(
    categories.map(async (category) => {
      const duration = await getRecommendedDuration(userId, category);
      return duration ? { category, duration } : null;
    }),
  );

  const validRecommendations = results.filter(Boolean);
  if (validRecommendations.length === 0) return null;

  // 3. Format recommendations into a system note context string
  const lines = validRecommendations.map(
    (r) => `- ${r.category}: ~${r.duration} mins`,
  );

  return `[System Note — Historical User Duration Preferences:      
    ${lines.join("\n")}
    Consider these durations when estimating times and building the     
  schedule.]`;
}
