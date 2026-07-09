import { Router } from "express";
import { ai, GEMINI_MODEL, getSystemInstruction } from "../config/gemini.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { prisma } from "../../lib/prisma.ts";
import {
  createScheduleStreamParser,
  createTaskLimiter,
  extractCompleteSentences,
} from "../utils/chatStream.js";

const router = Router();
const API_KEY = process.env.TTS_API_KEY;

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

function toClientMessage(message) {
  return {
    id: message.id,
    role: message.role,
    text: message.content,
    timestamp: message.createdAt.getTime(),
  };
}

function sendStreamEvent(res, event) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`${JSON.stringify(event)}\n`);
  }
}

async function findOwnedConversation(conversationId, userId, includeMessages = false) {
  if (!conversationId) return null;

  return prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    ...(includeMessages && {
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  });
}

async function createConversation(userId) {
  return prisma.conversation.create({
    data: { userId },
  });
}

async function createChat(userId, messages, timeZone = "UTC") {
  const systemInstruction = await getSystemInstruction(userId, timeZone);
  return ai.chats.create({
    model: GEMINI_MODEL,
    config: { systemInstruction },
    history: messages.map((message) => ({
      role: message.role,
      parts: [{ text: message.content }],
    })),
  });
}

// call google cloud tts and return a base 64 audio
const synthesizeSpeech = async (text) => {
  if (!text || typeof text !== "string" || !text.trim()) {
    return null;
  }

  if (!API_KEY) {
    console.error("TTS request skipped: TTS_API_KEY is not configured");
    return null;
  }

  const TTS_ENDPOINT = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${API_KEY}`;

  try {
    const response = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          text,
        },
        voice: {
          languageCode: "en-US",
          name: "en-US-Journey-F",
        },
        audioConfig: {
          audioEncoding: "MP3",
        },
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      console.error("Google TTS request failed:", {
        status: response.status,
        error: data?.error?.message || data,
      });
      return null;
    }

    if (!data.audioContent) {
      console.error("Google TTS response did not contain audioContent");
      return null;
    }

    return data.audioContent || null;
  } catch (error) {
    console.error("Error synthesizing speech:", error);
    return null;
  }
};

// ─── Conversation Routes ─────────────────────────────────────────────────────
router.get("/chat/conversations", requireAuth, async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    res.json(conversations);
  } catch (err) {
    console.error("List conversations error:", err);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.post("/chat/conversations", requireAuth, async (req, res) => {
  try {
    const conversation = await createConversation(req.userId);
    res.status(201).json(conversation);
  } catch (err) {
    console.error("Create conversation error:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/chat/conversations/:conversationId/messages", requireAuth, async (req, res) => {
  try {
    const conversation = await findOwnedConversation(
      req.params.conversationId,
      req.userId,
      true
    );
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.json(conversation.messages.map(toClientMessage));
  } catch (err) {
    console.error("Load messages error:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// ─── POST /chat/stream — Stream a Gemini response as NDJSON ──────────────────
router.post("/chat/stream", requireAuth, async (req, res) => {
  try {
    const { message, conversationId, timezone, muted } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    let conversation;
    if (conversationId) {
      conversation = await findOwnedConversation(conversationId, req.userId, true);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
    } else {
      conversation = await createConversation(req.userId);
      conversation.messages = [];
    }

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let clientDisconnected = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });

    const trimmedMessage = message.trim();
    const currentChat = await createChat(req.userId, conversation.messages, timezone);
    const stream = await currentChat.sendMessageStream({
      message: trimmedMessage,
    });

    const scheduleParser = createScheduleStreamParser();
    const ttsLimiter = createTaskLimiter(2);
    const ttsTasks = [];
    let fullText = "";
    let displayText = "";
    let sentenceBuffer = "";
    let nextAudioSequence = 0;

    const queueSentenceAudio = (sentence) => {
      if (muted || clientDisconnected) return;

      const sequence = nextAudioSequence;
      nextAudioSequence += 1;

      const task = ttsLimiter
        .run(async () => {
          if (clientDisconnected) return;

          const audioContent = await synthesizeSpeech(sentence);
          if (audioContent && !clientDisconnected) {
            sendStreamEvent(res, {
              type: "audio_chunk",
              sequence,
              audioContent,
            });
          }
        })
        .catch((error) => {
          console.warn(`Failed to synthesize audio chunk ${sequence}:`, error);
        });

      ttsTasks.push(task);
    };

    const handleVisibleText = (text) => {
      if (!text || clientDisconnected) return;

      displayText += text;
      sentenceBuffer += text;
      sendStreamEvent(res, {
        type: "text_delta",
        text,
      });

      const sentences = extractCompleteSentences(sentenceBuffer);
      sentenceBuffer = sentences.remaining;
      for (const sentence of sentences.complete) {
        queueSentenceAudio(sentence);
      }
    };

    for await (const chunk of stream) {
      if (clientDisconnected) break;

      const chunkText = chunk.text ?? "";
      if (!chunkText) continue;

      fullText += chunkText;
      handleVisibleText(scheduleParser.push(chunkText));
    }

    if (clientDisconnected) return;

    handleVisibleText(scheduleParser.finish());

    if (sentenceBuffer.trim()) {
      queueSentenceAudio(sentenceBuffer.trim());
      sentenceBuffer = "";
    }

    const scheduleEvents = parseJsonBlock(fullText, SCHEDULE_REGEX, "SCHEDULE_READY") ?? undefined;
    const scheduleUpdates = parseJsonBlock(fullText, UPDATE_REGEX, "SCHEDULE_UPDATE") ?? undefined;
    const scheduleDeletes = parseJsonBlock(fullText, DELETE_REGEX, "SCHEDULE_DELETE") ?? undefined;
    displayText = displayText.trim();
    const title = conversation.title || trimmedMessage.slice(0, 80);

    const [userMessage, modelMessage] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          role: "user",
          content: trimmedMessage,
          conversationId: conversation.id,
        },
      }),
      prisma.chatMessage.create({
        data: {
          role: "model",
          content: displayText,
          conversationId: conversation.id,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { title },
      }),
    ]);

    await Promise.all(ttsTasks);

    sendStreamEvent(res, {
      type: "final",
      conversationId: conversation.id,
      userMessage: toClientMessage(userMessage),
      modelMessage: {
        ...toClientMessage(modelMessage),
        scheduleEvents,
        scheduleUpdates,
        scheduleDeletes,
      },
      audioChunkCount: nextAudioSequence,
      text: displayText,
    });

    res.end();
  } catch (err) {
    console.error("Gemini streaming API error:", err);

    if (res.headersSent) {
      sendStreamEvent(res, {
        type: "error",
        message: err?.message || "Something went wrong with the Gemini API",
      });
      res.end();
      return;
    }

    res.status(500).json({
      error: err?.message || "Something went wrong with the Gemini API",
    });
  }
});

// Keep the old endpoint compatible while making reset create a durable thread.
router.delete("/chat/reset", requireAuth, async (req, res) => {
  try {
    const conversation = await createConversation(req.userId);
    res.json({ success: true, conversationId: conversation.id });
  } catch (err) {
    console.error("Reset conversation error:", err);
    res.status(500).json({ error: "Failed to reset conversation" });
  }
});

export default router;
