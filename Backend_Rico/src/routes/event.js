import { Router } from "express";
import {
  createEvent,
  getAllEvents,
  updateEvent,
  deleteEvent,
} from "../controller/eventController.js";
import { requireAuth } from "../../middleware/authMiddleware.js";

const router = Router();

router.post("/events", requireAuth, createEvent);
router.get("/events", requireAuth, getAllEvents);
router.put("/events/:id", requireAuth, updateEvent);
router.delete("/events/:id", requireAuth, deleteEvent);

export default router;
