import { Router } from "express";
import { ai, GEMINI_CONFIG } from "../config/gemini.js";

const router = Router();

// ─── Schedule Parser (same regex as frontend) ────────────────────────────────
const SCHEDULE_REGEX = /<SCHEDULE_READY>\s*([\s\S]*?)\s*<\/SCHEDULE_READY>/;

function parseScheduleBlock(text) {
  const match = text.match(SCHEDULE_REGEX);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    console.warn("Failed to parse SCHEDULE_READY JSON:", match[1]);
    return null;
  }
}

function stripScheduleBlock(text) {
  return text.replace(SCHEDULE_REGEX, "").trim();
}

// ─── Single Global Chat Session ──────────────────────────────────────────────
let chat = null;

function getOrCreateChat() {
  if (!chat) {
    chat = ai.chats.create({
      model: GEMINI_CONFIG.model,
      config: {
        systemInstruction: GEMINI_CONFIG.systemInstruction,
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

    const currentChat = getOrCreateChat();
    const response = await currentChat.sendMessage({ message: message.trim() });

    let fullText = "";
    let thinking = "";

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (!part.text) continue;
        fullText += part.text;
      }
    }

    // Parse schedule events (if present)
    const scheduleEvents = parseScheduleBlock(fullText) ?? undefined;
    const displayText = scheduleEvents ? stripScheduleBlock(fullText) : fullText;

    res.json({
      text: displayText,
      thinking: thinking || undefined,
      scheduleEvents,
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
