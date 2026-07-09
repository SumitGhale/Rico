import { Router } from "express";
import { register, login, getMe, deleteMyAccount } from "../controller/authController.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { exchangeGoogleToken, getGoogleAuthStatus, disconnectGoogleAuth } from "../controller/googleauthcontroller.js";

const router = Router();

// ─── Email/Password Auth ─────────────────────────────────────────────────────
router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, getMe);

router.delete("/me", requireAuth, deleteMyAccount);


// ─── Google Calendar OAuth ───────────────────────────────────────────────────
router.post("/google/exchange", requireAuth, exchangeGoogleToken);

// ─── GET /api/auth/google/status ─────────────────────────────────────────────
// The app calls this to check whether the user has already connected.

router.get("/google/status", requireAuth, getGoogleAuthStatus);

// ─── DELETE /api/auth/google/disconnect ──────────────────────────────────────
// Removes the stored tokens — effectively disconnects Google Calendar.

router.delete("/google/disconnect", requireAuth, disconnectGoogleAuth);

export default router;
