import { Router } from "express";
import { register, login, getMe } from "../controller/authController.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { exchangeGoogleToken, getGoogleAuthStatus, disconnectGoogleAuth } from "../controller/googleauthcontroller.js";

const router = Router();

// ─── Email/Password Auth ─────────────────────────────────────────────────────
router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, getMe);

// ─── Google Calendar OAuth ───────────────────────────────────────────────────
router.post("/google/exchange", exchangeGoogleToken);

// ─── GET /api/auth/google/status ─────────────────────────────────────────────
// The app calls this to check whether the user has already connected.

router.get("/google/status", getGoogleAuthStatus);

// ─── DELETE /api/auth/google/disconnect ──────────────────────────────────────
// Removes the stored tokens — effectively disconnects Google Calendar.

router.delete("/google/disconnect", disconnectGoogleAuth);

export default router;
