import { prisma } from "../../lib/prisma.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 12;

// ─── Register ─────────────────────────────────────────────────────────────────

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // ── Validate input ──────────────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // ── Check for existing user ─────────────────────────────────────────
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // ── Hash password ───────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // ── Create User + Account in a single transaction ───────────────────
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: name?.trim() || null,
        },
      });

      await tx.account.create({
        data: {
          provider: "email",
          providerId: email.toLowerCase().trim(),
          passwordHash,
          userId: newUser.id,
        },
      });

      return newUser;
    });

    // ── Sign JWT ────────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to register user" });
  }
};

// ─── Login ──────────────────────────────────────────────────────────────────

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Validate input ──────────────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password is required" });
    }

    // ── Find the email account + its linked user ────────────────────────
    const account = await prisma.account.findUnique({
      where: {
        provider_providerId: {
          provider: "email",
          providerId: email.toLowerCase().trim(),
        },
      },
      include: { user: true },
    });

    if (!account || !account.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // ── Compare password ────────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, account.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // ── Sign JWT ────────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: account.user.id, email: account.user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: account.user.id,
        email: account.user.email,
        name: account.user.name,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to log in" });
  }
};

// ─── Get Me ─────────────────────────────────────────────────────────────────

export const getMe = async (req, res) => {
  try {
    // req.userId is populated by the requireAuth middleware
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (err) {
    console.error("Get Me error:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
};

export const deleteMyAccount = async (req, res) => {
  const userId = req.userId;
  try {
    // GoogleToken has no FK/cascade to User (its id is set to the userId), so
    // remove it explicitly. deleteMany is a no-op if there's no token.
    await prisma.googleToken.deleteMany({ where: { id: userId } });

    // Deleting the user cascades to Account, Event, Conversation, ChatMessage.
    await prisma.user.delete({ where: { id: userId } });

    res.status(200).json({ message: "User account deleted successfully" });
  } catch (error) {
    console.error("Delete My Account error:", error);
    res.status(500).json({ error: "Failed to delete user account" });
  }
};
