import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const sharedOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

const getIpKey = (req) => ipKeyGenerator(req.ip, 56);

const getUserKey = (req) => req.userId || getIpKey(req);

export const loginLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `login:${getIpKey(req)}`,
  // Successful logins are removed from the counter.
  skipSuccessfulRequests: true,
  message: {
    error: "Too many failed login attempts. Please try again later.",
  },
});

export const registrationLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `register:${getIpKey(req)}`,
  message: {
    error: "Too many accounts created. Please try again later.",
  },
});

export const aiLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `ai:${getUserKey(req)}`,
  message: {
    error: "You have sent too many AI requests. Please wait and try again.",
  },
});

export const generalApiLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  limit: 150,
  keyGenerator: (req) => `api:${getUserKey(req)}`,
  message: {
    error: "Too many requests. Please wait and try again.",
  },
});
