import { Router } from "express";
import {
  createEvent,
  getAllEvents,
  updateEvent,
  deleteEvent,
} from "../controller/eventController.js";
import { aiLimiter, generalApiLimiter } from "../../middleware/rateLimit.js";

const router = Router();

router.post("/events", aiLimiter, createEvent);
router.get("/events", generalApiLimiter, getAllEvents);
router.put("/events/:id", generalApiLimiter, updateEvent);
router.delete("/events/:id", generalApiLimiter, deleteEvent);

export default router;
