# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rico is a voice-first AI planning assistant. Users converse with Gemini to plan their day; the AI proposes events in structured XML blocks that the app parses and adds to the calendar. The repo is a monorepo with two independent packages:

- `Backend_Rico/` — Node.js/Express REST API (`npm run dev`, port 8000)
- `Frontend_Rico/` — Expo/React Native app (iOS-primary, also Android/web)

## Commands

### Backend (`Backend_Rico/`)
```bash
npm run dev       # watch mode via tsx
npm run start     # production start
npx prisma migrate dev    # run DB migrations
npx prisma studio         # open Prisma Studio GUI
npx prisma generate       # regenerate client after schema change
```

### Frontend (`Frontend_Rico/`)
```bash
npx expo start            # start Metro bundler (scan QR)
npx expo run:ios          # build & run on iOS simulator
npx expo run:android      # build & run on Android
```

### Tests
```bash
# Backend only — no test runner configured for frontend
cd Backend_Rico && node --test src/utils/chatStream.test.js
```

## Architecture

### Backend

**Entry**: `src/app.js` — mounts three routers under `/api`:
- `/api/auth` — register/login/google-oauth (`src/routes/auth.js`)
- `/api/chat`, `/api/chat/stream`, `/api/chat/conversations` — Gemini chat (`src/routes/chat.js`)
- `/api/events` — CRUD for calendar events (`src/routes/event.js`)

**Auth**: JWT via `middleware/authMiddleware.js`. `requireAuth` validates the `Authorization: Bearer <token>` header and attaches `req.userId`. All non-auth routes require this middleware.

**Database**: Prisma with PostgreSQL (Prisma Postgres hosted). Schema at `prisma/schema.prisma`. Generated client is output to `generated/prisma/`. Models: `User`, `Account`, `Event`, `GoogleToken`, `Conversation`, `ChatMessage`.

**Gemini integration** (`src/config/gemini.js`): Uses `gemini-2.5-flash`. Each chat call dynamically builds a system prompt via `getSystemInstruction(userId)` which injects the user's current calendar events from DB so Gemini can reference event IDs for updates/deletes.

**Streaming chat** (`POST /api/chat/stream`): Streams NDJSON responses. The backend:
1. Creates/resumes a `Conversation` record from DB history
2. Streams Gemini output through `createScheduleStreamParser()` which suppresses `<SCHEDULE_*>` XML blocks from the text stream
3. Concurrently sends each complete sentence to Google Cloud TTS (max 2 concurrent TTS requests via `createTaskLimiter`)
4. Emits three event types over the NDJSON stream: `text_delta`, `audio_chunk` (base64 MP3, sequenced), `final` (persisted messages + parsed schedule blocks)

**Schedule protocol**: Gemini wraps structured data in XML tags that are parsed out of the stream:
- `<SCHEDULE_READY>[...]</SCHEDULE_READY>` — new events to create
- `<SCHEDULE_UPDATE>[...]</SCHEDULE_UPDATE>` — events to update (by DB CUID)
- `<SCHEDULE_DELETE>[...]</SCHEDULE_DELETE>` — events to delete (by DB CUID)

### Frontend

**Routing**: Expo Router (file-based). `app/_layout.tsx` wraps the tree with three context providers in order: `AuthProvider` → `WhisperModelProvider` → `CalendarEventsProvider`. The `Stack.Protected` guard redirects unauthenticated users to `app/sign-in.tsx`.

**Key hooks (all context-backed — do not use outside their providers)**:
- `useAuth` (`hooks/useAuth.tsx`) — JWT token management via `expo-secure-store`, Google OAuth, register/login
- `useWhisperModel` (`hooks/useWhisperModel.tsx`) — manages on-device Whisper model download/init/switch. Must be inside `WhisperModelProvider`. Downloads models from HuggingFace to device documents directory.
- `useCalendarEvents` (`hooks/useCalendarEvents.ts`) — fetches events from backend; exposes `addEvents`, `updateEvents`, `deleteEvents` which correspond to the three Gemini schedule block types
- `useLLM` (`hooks/useLLM.ts`) — streams chat from backend, parses NDJSON, delivers audio chunk callbacks to `useAudio`
- `useAudio` (`hooks/useAudio.ts`) — sequences and plays TTS audio chunks in order using `expo-audio`; also manages microphone permissions

**Main screen** (`app/(tabs)/index.tsx`): Composes all hooks. Voice recording uses `whisperContext.transcribeRealtime()` with a 1500 ms endpoint-stability timer to auto-submit when the user stops speaking. After TTS playback finishes, if a voice session is active (`voiceSessionActiveRef`), recording auto-restarts for hands-free conversation.

**Calendar screen** (`app/calendar.tsx`): Uses `@howljs/calendar-kit` for the draggable week/day view. Events from Google Calendar are prefixed with 📅 and marked non-draggable.

**Styling**: NativeWind (Tailwind for React Native). Use `className` props where available; fall back to inline `style` objects. Global CSS in `global.css`.

### Environment Variables

**Backend** (`Backend_Rico/.env`):
| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key for Gemini |
| `TTS_API_KEY` | Google Cloud TTS API key |
| `JWT_SECRET` | Signs/verifies JWT tokens |
| `DATABASE_URL` | Prisma Postgres connection string |
| `PORT` | HTTP port (default 8000) |
| `GOOGLE_IOS_CLIENT_ID` | OAuth client for Google sign-in |

**Frontend** (`Frontend_Rico/.env`):
| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | Backend URL — must be LAN IP (e.g. `http://192.168.x.x:8000`), not `localhost`, so physical devices can reach the dev server |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Same OAuth client ID used for Google sign-in |

### Whisper Models

Two quantized GGML models are available (defined in `useWhisperModel.tsx`):
- `ggml-base.en-q5_1` (default, ~60 MB) — better accuracy
- `ggml-tiny.en-q5_1` (~32 MB) — faster, less accurate

Models are downloaded on first use and stored in the device's documents directory under `whisper-models/`. The selected model ID is persisted to `expo-secure-store`. The `modal` screen (`app/modal.tsx`) is the model management UI, presented from the chat screen header.
