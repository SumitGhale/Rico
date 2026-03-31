import { Router } from "express";
import { ai, GEMINI_MODEL, getSystemInstruction } from "../config/gemini.js";

const router = Router();

// ─── Block Parsers ───────────────────────────────────────────────────────────

const SCHEDULE_REGEX = /<SCHEDULE_READY>\s*([\s\S]*?)\s*<\/SCHEDULE_READY>/;
const UPDATE_REGEX = /<SCHEDULE_UPDATE>\s*([\s\S]*?)\s*<\/SCHEDULE_UPDATE>/;
const DELETE_REGEX = /<SCHEDULE_DELETE>\s*([\s\S]*?)\s*<\/SCHEDULE_DELETE>/;

function parseJsonBlock(text, regex, label) {
  const match = text.match(regex);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    console.warn(`Failed to parse ${label} JSON:`, match[1]);
    return null;
  }
}

function stripAllBlocks(text) {
  return text
    .replace(SCHEDULE_REGEX, "")
    .replace(UPDATE_REGEX, "")
    .replace(DELETE_REGEX, "")
    .trim();
}

// ─── Single Global Chat Session ──────────────────────────────────────────────
let chat = null;

async function getOrCreateChat() {
  if (!chat) {
    const systemInstruction = await getSystemInstruction();
    chat = ai.chats.create({
      model: GEMINI_MODEL,
      config: {
        systemInstruction,
      },
    });
  }
  return chat;
}

// ─── POST /chat — Send a message ─────────────────────────────────────────────
router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const currentChat = await getOrCreateChat();
    const response = await currentChat.sendMessage({ message: message.trim() });

    let fullText = "";
    let thinking = "";

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (!part.text) continue;
        fullText += part.text;
      }
    }

    // Parse all block types
    const scheduleEvents = parseJsonBlock(fullText, SCHEDULE_REGEX, "SCHEDULE_READY") ?? undefined;
    const scheduleUpdates = parseJsonBlock(fullText, UPDATE_REGEX, "SCHEDULE_UPDATE") ?? undefined;
    const scheduleDeletes = parseJsonBlock(fullText, DELETE_REGEX, "SCHEDULE_DELETE") ?? undefined;

    const hasBlocks = scheduleEvents || scheduleUpdates || scheduleDeletes;
    const displayText = hasBlocks ? stripAllBlocks(fullText) : fullText;

    res.json({
      text: displayText,
      thinking: thinking || undefined,
      scheduleEvents,
      scheduleUpdates,
      scheduleDeletes,
    });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({
      error: err?.message || "Something went wrong with the Gemini API",
    });
  }
});

// ─── DELETE /chat/reset — Reset the conversation ─────────────────────────────
router.delete("/chat/reset", (_req, res) => {
  chat = null;
  res.json({ success: true });
});

export default router;
