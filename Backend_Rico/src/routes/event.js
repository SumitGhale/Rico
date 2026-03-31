import { Router } from "express";
import {
  createEvent,
  getAllEvents,
  updateEvent,
  deleteEvent,
} from "../controller/eventController.js";

const router = Router();

router.post("/events", createEvent);
router.get("/events", getAllEvents);
router.put("/events/:id", updateEvent);
router.delete("/events/:id", deleteEvent);

export default router;
