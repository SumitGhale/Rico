import { ai, GEMINI_MODEL } from "../config/gemini.js";

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
You are a strict classifier. Given an event title, respond with exactly
one of these category names, and nothing else: 
${EVENT_CATEGORIES.join(", ")}
Examples:
"Gym workout & cardio" -> exercise
"Team sync with engineering" -> work
"Grocery shopping at Trader Joe's" -> shopping
"Dinner with parents" -> family
"Doctor appointment" -> health

Do not include any extra text, quotes, or markdown formatting. 
`;

// creating a llm for event categorisation
async function createChat() {
  return ai.chats.create({
    model: GEMINI_MODEL,
    config: { systemInstruction: CATEGORIZATION_SYSTEM_PROMPT },
  });
}
export async function categorizeEvent(eventTitle = "Gym workout & cardio") {
  const chat = await createChat();
  const response = await chat.sendMessage({
    message: eventTitle,
  });
  console.log(response.text); // should output: exercise
  return response.text;
}
