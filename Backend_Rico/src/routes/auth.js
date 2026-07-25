import { Router } from "express";
import { register, login, getMe, deleteMyAccount } from "../controller/authController.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { exchangeGoogleToken, getGoogleAuthStatus, disconnectGoogleAuth } from "../controller/googleauthcontroller.js";
import {
  generalApiLimiter,
  loginLimiter,
  registrationLimiter,
} from "../../middleware/rateLimit.js";

const router = Router();

// ─── Email/Password Auth ─────────────────────────────────────────────────────
router.post("/register", registrationLimiter, register);
router.post("/login", loginLimiter, login);
router.get("/me", requireAuth, generalApiLimiter, getMe);

router.delete("/me", requireAuth, generalApiLimiter, deleteMyAccount);


// ─── Google Calendar OAuth ───────────────────────────────────────────────────
router.post(
  "/google/exchange",
  requireAuth,
  generalApiLimiter,
  exchangeGoogleToken,
);

// ─── GET /api/auth/google/status ─────────────────────────────────────────────
// The app calls this to check whether the user has already connected.

router.get(
  "/google/status",
  requireAuth,
  generalApiLimiter,
  getGoogleAuthStatus,
);

// ─── DELETE /api/auth/google/disconnect ──────────────────────────────────────
// Removes the stored tokens — effectively disconnects Google Calendar.

router.delete(
  "/google/disconnect",
  requireAuth,
  generalApiLimiter,
  disconnectGoogleAuth,
);

export default router;
