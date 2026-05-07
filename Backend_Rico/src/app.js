import "dotenv/config";
import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat.js";
import eventRouter from "./routes/event.js";
import authRouter from "./routes/auth.js";
import process from "node:process";

const port = process.env.PORT || 8000;

const app = express();

app.use(cors());
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api", chatRouter);
app.use("/api", eventRouter);

// ─── Start Server ─────────────────────────────────────────────────────────────
// if (process.env.NODE_ENV !== "production") {
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
// }

export default app;