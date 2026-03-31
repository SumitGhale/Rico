import "dotenv/config";
import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat.js";
import eventRouter from "./routes/event.js";

const app = express();

app.use(cors());                 // Enable CORS
app.use(express.json());         // Parse JSON bodies

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api", chatRouter);
app.use("/api", eventRouter);

if (process.env.NODE_ENV !== "production") {
  app.listen(8000, () => {
    console.log("Server is running on port 8000");
  });
}

export default app;